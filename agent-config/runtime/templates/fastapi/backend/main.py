from contextlib import asynccontextmanager, contextmanager
import sqlite3
from html import escape

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from platform_config import DATA_DIR, app_metadata, setting


@contextmanager
def database():
    connection = sqlite3.connect(DATA_DIR / "app.db", timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


@asynccontextmanager
async def lifespan(app):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with database() as db:
        # An idempotent initial schema; future changes need versioned migrations.
        db.execute("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
    yield


app = FastAPI(title="Opsiforce FastAPI", lifespan=lifespan)


class NewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value):
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


@app.get("/")
def index(request: Request):
    greeting = setting("APP_GREETING", "FastAPI backend is ready")
    headers = {"Vary": "Accept"}
    if "text/html" in request.headers.get("accept", ""):
        return HTMLResponse(
            "<!doctype html><html lang='en'><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>FastAPI backend</title><style>body{font:16px system-ui;max-width:680px;margin:8vh auto;padding:24px;line-height:1.6}a{color:#09675b}</style>"
            "<h1>FastAPI backend</h1><p>" + escape(greeting) + "</p>"
            "<p><a href='/docs' target='_blank' rel='noreferrer'>API documentation</a></p>"
            "<p><a href='/api/health' target='_blank' rel='noreferrer'>Health</a> · "
            "<a href='/api/items' target='_blank' rel='noreferrer'>Items API</a></p></html>",
            headers=headers,
        )
    return JSONResponse({"message": greeting, "health": "/api/health", "docs": "/docs"}, headers=headers)


@app.get("/api/health")
def health():
    with database() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok"}


@app.get("/api/app-meta")
def metadata():
    return app_metadata()


@app.get("/api/items")
def items():
    with database() as db:
        return [dict(row) for row in db.execute("SELECT id, name FROM items ORDER BY id LIMIT 100")]


@app.post("/api/items", status_code=201)
def create_item(item: NewItem):
    with database() as db:
        cursor = db.execute("INSERT INTO items(name) VALUES (?)", (item.name,))
        return {"id": cursor.lastrowid, "name": item.name}
