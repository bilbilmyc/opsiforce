"""Platform-owned paths stay in process env; user config stays server-side."""
import json
import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_ROOT / "data"))
META_PATH = Path(os.environ.get("APP_META_PATH", APP_ROOT / "app.meta.json"))


def load_config():
    target = Path(os.environ.get("APP_CONFIG_PATH", APP_ROOT / "opsiforce.env.json"))
    try:
        value = json.loads(target.read_text())
        if not isinstance(value, dict) or any(not isinstance(v, str) for v in value.values()):
            raise ValueError()
        return value
    except FileNotFoundError:
        return {}
    except (ValueError, OSError):
        raise RuntimeError("Invalid application configuration file") from None


CONFIG = load_config()


def setting(name, default=""):
    return CONFIG.get(name, os.environ.get(name, default))


def app_metadata():
    try:
        value = json.loads(META_PATH.read_text())
        if not isinstance(value, dict) or not isinstance(value.get("name"), str) or not value["name"].strip():
            return {"exists": False}
        description = value.get("description", "")
        return {"exists": True, "name": value["name"], "description": description if isinstance(description, str) else ""}
    except (OSError, ValueError):
        return {"exists": False}
