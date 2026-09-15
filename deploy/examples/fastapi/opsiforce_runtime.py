"""Small adapter for an existing FastAPI app hosted by Opsiforce."""
import json
import os
from pathlib import Path


def database_path(source_directory: Path) -> Path:
    directory = os.environ.get("APP_DATA_DIR")
    if not directory:
        return source_directory / "data.db"
    target = Path(directory)
    target.mkdir(parents=True, exist_ok=True)
    return target / "fastapi.db"


def install_metadata_route(app) -> None:
    @app.get("/api/app-meta", include_in_schema=False)
    def app_meta():
        path = Path(os.environ.get("APP_META_PATH", "/workspace/app/app.meta.json"))
        try:
            meta = json.loads(path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {"exists": False}
        return {"exists": True, "name": meta["name"], "description": meta.get("description", "")}
