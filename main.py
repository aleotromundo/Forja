from pathlib import Path
import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).parent
CATALOG_PATH = Path(os.getenv("CATALOG_PATH", BASE_DIR / "catalog.json"))


def load_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


app = FastAPI(title="El Encargado Catalog API", version="1.0.0")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def catalog_or_404() -> dict[str, Any]:
    try:
        return load_catalog()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Catalog not configured") from exc


@app.get("/api")
def api_root() -> dict[str, str]:
    return {"message": "El Encargado PWA API", "series": "el-encargado"}


@app.get("/api/series")
def get_series() -> dict[str, Any]:
    catalog = catalog_or_404()
    return {
        "slug": catalog["slug"],
        "title": catalog["title"],
        "overview": catalog["overview"],
        "year": catalog.get("year"),
        "cast": catalog.get("cast", []),
        "genres": catalog.get("genres", []),
        "poster": catalog.get("poster"),
        "backdrop": catalog.get("backdrop"),
        "seasons": [
            {"number": season["number"], "title": season["title"], "poster": season.get("poster")}
            for season in catalog.get("seasons", [])
        ],
    }


@app.get("/api/series/season/{season_number}")
def get_season(season_number: int) -> dict[str, Any]:
    catalog = catalog_or_404()
    season = next((item for item in catalog.get("seasons", []) if item["number"] == season_number), None)
    if season is None:
        raise HTTPException(status_code=404, detail="Temporada no encontrada")
    return {
        "season": season["number"],
        "poster": season.get("poster"),
        "episodes": [
            {"number": episode["number"], "title": episode.get("title", f"Episodio {episode['number']}")}
            for episode in season.get("episodes", [])
        ],
    }


@app.get("/api/series/episode/{season_number}/{episode_number}")
def get_episode(season_number: int, episode_number: int) -> dict[str, Any]:
    catalog = catalog_or_404()
    season = next((item for item in catalog.get("seasons", []) if item["number"] == season_number), None)
    if season is None:
        raise HTTPException(status_code=404, detail="Temporada no encontrada")
    episode = next((item for item in season.get("episodes", []) if item["number"] == episode_number), None)
    if episode is None:
        raise HTTPException(status_code=404, detail="Episodio no encontrado")
    return {
        "season": season_number,
        "episode": episode_number,
        "title": episode.get("title", f"Episodio {episode_number}"),
        "description": episode.get("description", ""),
        "backdrop": episode.get("backdrop"),
        "servers": episode.get("servers", []),
        "source_url": episode.get("source_url"),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
