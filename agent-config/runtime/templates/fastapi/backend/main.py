from contextlib import asynccontextmanager, contextmanager
import sqlite3

from fastapi import FastAPI
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
def index():
    return {"message": setting("APP_GREETING", "FastAPI backend is ready"), "health": "/api/health", "docs": "/docs"}


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
