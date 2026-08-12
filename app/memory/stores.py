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


class WorkingMemory:
    """Current missions, in-process."""

    def __init__(self):
        self._missions: dict[str, Mission] = {}
        self._lock = threading.Lock()

    def put(self, mission: Mission) -> None:
        with self._lock:
            self._missions[mission.id] = mission

    def get(self, mission_id: str) -> Mission | None:
        with self._lock:
            return self._missions.get(mission_id)

    def all(self) -> list[Mission]:
        with self._lock:
            return sorted(self._missions.values(), key=lambda m: m.created_at, reverse=True)


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
