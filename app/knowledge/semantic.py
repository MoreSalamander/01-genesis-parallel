"""Semantic memory — Qdrant + Gemini embeddings (preserved-stack responsibility).

Verified/conflicted claims are embedded (Google embedding model — hackathon
AI restriction) and upserted, enabling "have we seen a signal like this
before?" across every mission — the change-detection substrate of the locked
§10/§15 episodic memory direction.
"""
from __future__ import annotations

import uuid

from app.config import Settings

COLLECTION = "genesis-claims"
DIM = 768


class SemanticMemory:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._qdrant = None
        self._genai = None
        if settings.force_mock:
            return
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams

            self._qdrant = QdrantClient(url=settings.qdrant_url, timeout=5)
            existing = {c.name for c in self._qdrant.get_collections().collections}
            if COLLECTION not in existing:
                self._qdrant.create_collection(
                    COLLECTION, vectors_config=VectorParams(size=DIM, distance=Distance.COSINE)
                )
            print(f"[semantic] Qdrant connected: {settings.qdrant_url}/{COLLECTION}")
        except Exception as err:
            print(f"[semantic] Qdrant unreachable ({err}) — DEGRADED: no semantic memory")
            self._qdrant = None

    @property
    def available(self) -> bool:
        return self._qdrant is not None

    def _embed(self, texts: list[str]) -> list[list[float]] | None:
        try:
            if self._genai is None:
                from google import genai

                self._genai = genai.Client()
            from google.genai.types import EmbedContentConfig

            result = self._genai.models.embed_content(
                model=self.settings.embed_model,
                contents=texts,
                config=EmbedContentConfig(output_dimensionality=DIM),
            )
            return [e.values for e in result.embeddings]
        except Exception as err:
            print(f"[semantic] embedding failed ({err}) — skipping semantic upsert")
            return None

    def upsert_claims(self, mission) -> int:
        if self._qdrant is None:
            return 0
        claims = [c for c in mission.claims if c.entity and c.status.value in ("VERIFIED", "CONFLICTED")]
        if not claims:
            return 0
        vectors = self._embed([c.text for c in claims])
        if vectors is None:
            return 0
        from qdrant_client.models import PointStruct

        points = [
            PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, c.id)),
                vector=vec,
                payload={"claim_id": c.id, "mission_id": mission.id, "text": c.text,
                         "entity": c.entity, "status": c.status.value},
            )
            for c, vec in zip(claims, vectors)
        ]
        self._qdrant.upsert(COLLECTION, points=points)
        return len(points)

    def similar(self, query: str, limit: int = 5) -> list[dict]:
        if self._qdrant is None:
            return []
        vectors = self._embed([query])
        if vectors is None:
            return []
        result = self._qdrant.query_points(COLLECTION, query=vectors[0], limit=limit)
        return [{**(h.payload or {}), "score": h.score} for h in result.points]
