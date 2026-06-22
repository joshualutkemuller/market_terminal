"""FastAPI service — the NEWS_NLP_URL the Next app's enrichWithNlp() calls.

Endpoints:
  POST /score      {texts:[...]} → {model, scores:[{score,label}]}   (used by Next)
  POST /cluster    {headlines:[...]} → {model, clusters:[...]}        (NEWS-6 events)
  GET  /headlines  → latest gold ScoredHeadline rows (Next can read as primary)
  GET  /health
"""
from __future__ import annotations

import json

from fastapi import FastAPI

from . import sentiment
from .cluster import cluster as cluster_headlines
from .pipeline import score_headlines
from .schema import ClusterRequest, ClusterResponse, ScoreRequest, ScoreResponse
from .settings import settings

app = FastAPI(title="news-nlp", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": sentiment.model_name()}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    return ScoreResponse(model=sentiment.model_name(), scores=sentiment.score_texts(req.texts))


@app.post("/cluster", response_model=ClusterResponse)
def cluster(req: ClusterRequest) -> ClusterResponse:
    """Score + embed + cluster the posted headlines into events (NEWS-6)."""
    scored = score_headlines(req.headlines)
    return ClusterResponse(model=sentiment.model_name(), clusters=cluster_headlines(scored))


@app.get("/headlines")
def headlines() -> list[dict]:
    path = settings.gold_dir / "news_scored.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())
