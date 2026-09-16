## Python / FastAPI recipe

This project uses `fastapi@1`. Implement routes and validation with FastAPI/Pydantic in `app/backend`, and use Python's sqlite3 for the app database. Read user config through `platform_config.setting()`.

The application runs from `app/backend/.venv`. When adding a dependency, install it into this venv, regenerate the complete pinned `requirements.lock` from that environment, run `pip check`, and inspect the lock diff. Keep the startup's isolated venv and lock fingerprint behavior.

Before restart, run:

```bash
cd /workspace/app/backend
.venv/bin/python -m compileall -q . -x '(^|/)(\.venv|__pycache__)/'
.venv/bin/python -m pip check
```

Add targeted Python tests for changed business rules and run them. Uvicorn uses APP_PORT (default 3000); source changes require the platform restart command. There is no file reload watcher. `/docs` exposes OpenAPI documentation for inspecting the actual API.
