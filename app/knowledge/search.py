"""Evidence full-text search — OpenSearch (preserved-stack responsibility).

Every evidence item is indexed across missions, giving the Studio Head
institutional recall: "what have we ever retrieved about X?"
"""
from __future__ import annotations

from app.config import Settings

INDEX = "genesis-evidence"


class EvidenceSearch:
    """Connections retry lazily (30s backoff) — a substrate that boots slower than
    this process must not stay degraded for the process lifetime."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self._next_attempt = 0.0
        if not settings.force_mock:
            self._ensure()

    def _ensure(self) -> bool:
        import time

        if self._client is not None:
            return True
        if self.settings.force_mock or time.time() < self._next_attempt:
            return False
        self._next_attempt = time.time() + 30
        try:
            from opensearchpy import OpenSearch

            client = OpenSearch(hosts=[self.settings.opensearch_url], timeout=5)
            if not client.indices.exists(index=INDEX):
                client.indices.create(
                    index=INDEX,
                    body={"mappings": {"properties": {
                        "mission_id": {"type": "keyword"},
                        "claim": {"type": "text"},
                        "content": {"type": "text"},
                        "entity": {"type": "keyword"},
                        "status": {"type": "keyword"},
                        "source_url": {"type": "keyword"},
                        "source_title": {"type": "text"},
                        "at": {"type": "date"},
                    }}},
                )
            self._client = client
            print(f"[search] OpenSearch connected: {self.settings.opensearch_url}/{INDEX}")
            return True
        except Exception as err:
            print(f"[search] OpenSearch unreachable ({err}) — DEGRADED: evidence not indexed (will retry)")
            return False

    @property
    def available(self) -> bool:
        return self._ensure()

    def index_mission(self, mission) -> int:
        if not self._ensure():
            return 0
        source_by_id = {s.id: s for s in mission.sources}
        count = 0
        for evidence in mission.evidence:
            source = source_by_id.get(evidence.source_id)
            try:
                self._client.index(
                    index=INDEX,
                    id=evidence.id,
                    body={
                        "mission_id": mission.id,
                        "claim": evidence.claim_text,
                        "content": evidence.supporting_content,
                        "entity": evidence.related_entities[0] if evidence.related_entities else "",
                        "status": evidence.verification_status.value,
                        "source_url": source.url if source else "",
                        "source_title": source.title if source else "",
                        "at": evidence.retrieved_at.isoformat(),
                    },
                )
                count += 1
            except Exception as err:
                print(f"[search] index failed for {evidence.id}: {err}")
                break
        return count

    def search(self, query: str, limit: int = 10) -> list[dict]:
        if not self._ensure():
            return []
        result = self._client.search(
            index=INDEX,
            body={"query": {"multi_match": {"query": query,
                                            "fields": ["claim^2", "content", "entity^2", "source_title"]}},
                  "size": limit},
        )
        return [
            {**hit["_source"], "score": hit["_score"], "evidence_id": hit["_id"]}
            for hit in result.get("hits", {}).get("hits", [])
        ]
