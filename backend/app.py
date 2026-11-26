"""bigquery.live report API: Metabase saved question -> rows -> OpenRouter insight."""
import json
import os
import pathlib

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

ENV_PATH = pathlib.Path(os.environ.get(
    "BIGQUERY_LIVE_ENV", "/home/hermesdev/.hermes/profiles/bigquery/.env"))


def load_env(path=ENV_PATH):
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = load_env()
CARD_IDS = json.loads(ENV.get("METABASE_CARD_IDS", "{}"))
TAG_IDS = json.loads(ENV.get("METABASE_TAG_IDS", "{}"))
app = FastAPI()


class ReportRequest(BaseModel):
    preset: str
    days: int = 30


def ask_openrouter(columns, rows):
    payload = {
        "model": ENV.get("OPENROUTER_MODEL", "openrouter/auto"),
        "messages": [
            {"role": "system",
             "content": "One short business insight about these rows. No markdown."},
            {"role": "user", "content": f"columns={columns}\nrows={rows[:50]}"},
        ],
    }
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {ENV['OPENROUTER_API_KEY']}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/report")
def report(request: ReportRequest):
    if request.preset not in CARD_IDS:
        raise HTTPException(status_code=422, detail="unknown preset")
    base = ENV["METABASE_URL"].rstrip("/")
    key = ENV["METABASE_API_KEY"]
    card_id = CARD_IDS[request.preset]
    params = []
    if request.preset in TAG_IDS:
        params = [{
            "id": TAG_IDS[request.preset],
            "type": "number",
            "value": request.days,
            "target": ["variable", ["template-tag", "days"]],
        }]
    try:
        card = httpx.post(
            f"{base}/api/card/{card_id}/query",
            json={"parameters": params},
            headers={"x-api-key": key},
            timeout=60,
        )
        card.raise_for_status()
        data = card.json()["data"]
        columns = [col["name"] for col in data["cols"]]
        rows = data["rows"]
        insight = ask_openrouter(columns, rows)
    except (KeyError, httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail=f"upstream error: {type(exc).__name__}")
    return {"question_id": card_id, "preset": request.preset,
            "columns": columns, "rows": rows, "insight": insight}
