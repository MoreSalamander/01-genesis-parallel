"""Event model (locked §14). Events are appended to a JSONL log; other Genesis
systems can eventually subscribe through the federation boundary — the contract
is designed now, the transport stays local for the standalone MVP.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

EVENT_NAMES = {
    "signal.discovered",
    "evidence.created",
    "claim.verified",
    "claim.conflicted",
    "knowledge.updated",
    "finding.created",
    "opportunity.detected",
    "threat.detected",
    "recommendation.created",
    "intelligence.completed",
    "intelligence.incomplete",
    "authorization.decided",
}


class EventBus:
    def __init__(self, data_dir: Path):
        self.path = data_dir / "events.jsonl"
        self.subscribers: list = []

    def emit(self, name: str, **payload) -> None:
        if name not in EVENT_NAMES:
            raise ValueError(f"Unknown event '{name}' — add it to the §14 contract first")
        # payload first — the event name and timestamp can never be clobbered by kwargs
        record = {
            **payload,
            "event": name,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
        for callback in self.subscribers:
            callback(record)

    def tail(self, limit: int = 100) -> list[dict]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()[-limit:]
        return [json.loads(line) for line in lines]
