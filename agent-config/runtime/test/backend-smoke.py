#!/usr/bin/env python3
"""Run inside a disposable Agent container, never in a user's workspace.

Exercises real dependencies, HTTP, SQLite, guard and agent-control. Git archive
models the publish source boundary; it is not a Kubernetes publish acceptance test.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import shutil
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

RUNTIME = Path(__file__).resolve().parents[1]
EVIDENCE = Path(os.environ.get("SMOKE_EVIDENCE", "/tmp/backend-smoke-evidence"))
EVIDENCE.mkdir(parents=True, exist_ok=True)


def command(*args, cwd=None, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, stderr=subprocess.STDOUT, text=True)


def request(port, route, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}{route}", data=data, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None


def eventually(check, timeout=300):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    raise AssertionError("service condition timed out; inspect evidence logs")


def stop(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    except ProcessLookupError:
        pass
    # Clean surviving descendants even when their group leader already exited.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def exercise(root, recipe, mode, expected_names, add_name):
    env = {**os.environ, "WORKSPACE": str(root), "OPSIFORCE_ENV": mode, "APP_PORT": "3300",
           "CONTROL_PORT": "4910", "OPSIFORCE_CONTROL_TOKEN": "isolated-smoke-token"}
    app = root / "app"
    config = app / "opsiforce.env.json"
    config.write_text(json.dumps({"APP_GREETING": "before restart", "PRIVATE_TEST_KEY": "never expose"}))
    log = open(EVIDENCE / f"{recipe}-{mode}-{add_name}.log", "w")
    runtime = subprocess.Popen(["node", str(RUNTIME / "cli.mjs"), "run"], env=env,
                               stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    control = None
    try:
        eventually(lambda: request(3300, "/api/health") == (200, {"status": "ok"}))
        assert request(3300, "/")[1]["message"] == "before restart"
        with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:3300/", headers={"Accept": "text/html"}), timeout=3) as response:
            assert "text/html" in response.headers["Content-Type"]
            assert response.headers["Vary"] == "Accept"
            html = response.read().decode()
            assert "before restart" in html and "never expose" not in html
        for route in ["/opsiforce.env.json", "/data/app.db", "/backend/main.py", "/backend/main.go"]:
            assert request(3300, route)[0] == 404, route
        assert request(3300, "/api/app-meta") == (200, {"exists": False})
        meta = {"name": recipe + " test", "description": "smoke", "private": "do not expose"}
        (app / "app.meta.json").write_text(json.dumps(meta))
        assert request(3300, "/api/app-meta")[1] == {"exists": True, "name": recipe + " test", "description": "smoke"}
        (app / "app.meta.json").write_text("{invalid")
        assert request(3300, "/api/app-meta") == (200, {"exists": False})
        (app / "app.meta.json").write_text(json.dumps(meta))
        assert [v["name"] for v in request(3300, "/api/items")[1]] == expected_names
        assert request(3300, "/api/items", "POST", {"name": add_name})[0] == 201
        for payload in [{"name": "   "}, {"name": "x" * 201}, {"name": "ok", "unknown": 1}, {"name": None}]:
            assert request(3300, "/api/items", "POST", payload)[0] == 422, payload
        config.write_text(json.dumps({"APP_GREETING": "after restart", "PRIVATE_TEST_KEY": "never expose"}))
        assert request(3300, "/")[1]["message"] == "before restart"
        control = subprocess.Popen(["/usr/local/bin/agent-control"], env=env, stdout=log,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        eventually(lambda: request(4910, "/restart-app", "POST", headers={})[0] == 403, timeout=10)
        restarted = json.loads(command("node", str(RUNTIME / "cli.mjs"), "restart", env=env))
        assert restarted["status"] == "ready" and restarted["restartedProcesses"] >= 1, restarted
        eventually(lambda: request(3300, "/")[1].get("message") == "after restart", timeout=60)
        assert [v["name"] for v in request(3300, "/api/items")[1]] == expected_names + [add_name]
        with sqlite3.connect(app / "data/app.db") as database:
            assert database.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert runtime.poll() is None
        print(f"PASS {recipe} {mode}: HTTP, metadata, validation, SQLite, real /restart-app, config reload", flush=True)
    finally:
        if control:
            stop(control)
        stop(runtime)
        log.close()
        (app / "app.meta.json").unlink(missing_ok=True)
    for invalid in ['{"secret":"DO_NOT_LOG",', 'null', '{"secret":null}', '{"secret":123}']:
        config.write_text(invalid)
        executable = [str(app / "backend/.venv/bin/python"), "-c", "import platform_config"] if recipe == "fastapi" else [str(app / "backend/.bin/server")]
        result = subprocess.run(executable, cwd=app / "backend", env=env, capture_output=True, timeout=5)
        assert result.returncode != 0
        assert b"DO_NOT_LOG" not in result.stdout + result.stderr
    print(f"PASS {recipe}: invalid configuration stops startup without exposing values", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", action="append", choices=["fastapi", "go"])
    for recipe in parser.parse_args().recipe or ["fastapi", "go"]:
        with tempfile.TemporaryDirectory(prefix=f"opsiforce-{recipe}-") as directory:
            root = Path(directory)
            dev, prod = root / "dev", root / "prod"
            dev.mkdir()
            prod.mkdir()
            shutil.copytree(RUNTIME / "bootstrap", dev / "app")
            command("node", str(RUNTIME / "cli.mjs"), "init", recipe + "@1", env={**os.environ, "WORKSPACE": str(dev)})
            exercise(dev, recipe, "development", [], "development-row")
            command("git", "init", "-q", cwd=dev)
            command("git", "add", ".", cwd=dev)
            tracked = command("git", "ls-files", cwd=dev)
            assert "app/data/" not in tracked and "opsiforce.env.json" not in tracked
            assert "/.venv/" not in tracked and "/.cache/" not in tracked and "/.bin/" not in tracked
            command("git", "-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "template", cwd=dev)
            archive = root / "snapshot.tar"
            command("git", "archive", "HEAD", "-o", str(archive), cwd=dev)
            # This archive is created immediately above from the bundled template.
            command("tar", "-xf", str(archive), "-C", str(prod))
            assert not (prod / "app/data/app.db").exists()
            exercise(prod, recipe, "production", [], "production-row")
            # A repeat source deployment must retain the production database.
            command("tar", "-xf", str(archive), "-C", str(prod))
            exercise(prod, recipe, "production", ["production-row"], "second-production-row")
            print(f"PASS {recipe}: source archive excludes development data and repeat deploy preserves production rows", flush=True)


if __name__ == "__main__":
    main()
