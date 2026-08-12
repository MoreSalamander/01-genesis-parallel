"""Three-tier memory (locked §10): working (current mission), episodic (past
missions), institutional (knowledge graph — see app/knowledge). Not everything
graduates between tiers.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.models.evidence import Mission


def _newest(a: Mission | None, b: Mission | None) -> Mission | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if a.updated_at >= b.updated_at else b


class WorkingMemory:
    """Write-through cache over the durable document store (PostgreSQL)."""

    def __init__(self, store):
        self._store = store
        self._missions: dict[str, Mission] = {}
        self._lock = threading.Lock()

    def put(self, mission: Mission) -> None:
        with self._lock:
            self._missions[mission.id] = mission
        try:
            self._store.upsert("mission", mission.id, mission.status.value, False,
                               mission.model_dump(mode="json"))
        except Exception as err:
            print(f"[state] durable persist failed for {mission.id}: {err}")

    def get(self, mission_id: str) -> Mission | None:
        """Newest copy wins — a Temporal worker may have advanced the durable doc."""
        with self._lock:
            cached = self._missions.get(mission_id)
        doc = self._store.fetch("mission", mission_id)
        stored = None
        if doc is not None:
            try:
                stored = Mission.model_validate(doc)
            except Exception:
                stored = None
        winner = _newest(cached, stored)
        if winner is stored and stored is not None:
            with self._lock:
                self._missions[mission_id] = stored
        return winner

    def all(self) -> list[Mission]:
        merged: dict[str, Mission] = {}
        for doc in self._store.list("mission", limit=100):
            try:
                mission = Mission.model_validate(doc)
                merged[mission.id] = mission
            except Exception:
                continue
        with self._lock:
            for mission_id, cached in self._missions.items():
                merged[mission_id] = _newest(cached, merged.get(mission_id)) or cached
        return sorted(merged.values(), key=lambda m: m.created_at, reverse=True)


class EpisodicMemory:
    """Completed mission summaries — 'we researched X last month' (§10)."""

    def __init__(self, data_dir: Path):
        self.path = data_dir / "episodic_missions.jsonl"

    def record(self, mission: Mission) -> None:
        summary = {
            "mission_id": mission.id,
            "objective": mission.objective,
            "status": mission.status.value,
            "sources": len(mission.sources),
            "verified_claims": len(mission.verified_claims),
            "conflicted_claims": len(mission.conflicted_claims),
            "recommendation": mission.recommendation.action if mission.recommendation else None,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(summary, ensure_ascii=False) + "\n")

    def list(self, limit: int = 50) -> list[dict]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()[-limit:]
        return [json.loads(line) for line in lines]
