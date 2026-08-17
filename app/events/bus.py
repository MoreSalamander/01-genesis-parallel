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
    # The answer named something it did not have, and the system went back out
    # for it. Recorded so a follow-up round is visible as a deliberate step
    # rather than as unexplained extra searching.
    "intelligence.gap_found",
    "authorization.decided",
}


class EventBus:
    """Event fabric: NATS publish (genesis.signal.events) + local JSONL audit trail.

    NATS is part of the deployed stack (ops/docker-compose.yml). Publish failures
    degrade to audit-log-only and are surfaced once — never silent, never fatal.
    """

    def __init__(self, data_dir: Path, nats_url: str = "", subject: str = "genesis.signal.events"):
        self.path = data_dir / "events.jsonl"
        self.subscribers: list = []
        self._nats_url = nats_url
        self._subject = subject
        self._nats_warned = False

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
        self._publish(record)

    def _publish(self, record: dict) -> None:
        if not self._nats_url:
            return
        try:
            import asyncio

            import nats

            async def _pub():
                nc = await nats.connect(self._nats_url, connect_timeout=2, max_reconnect_attempts=1)
                await nc.publish(self._subject, json.dumps(record, ensure_ascii=False, default=str).encode())
                await nc.flush(timeout=2)
                await nc.close()

            asyncio.run(_pub())
        except Exception as err:
            if not self._nats_warned:
                print(f"[events] NATS publish failed ({err}) — DEGRADED: audit log only")
                self._nats_warned = True

    def tail(self, limit: int = 100, mission_id: str = "") -> list[dict]:
        """Recent events, or the events of one mission wherever they sit.

        The console reads a mission's own activity out of this stream — which
        agent produced what, how many sources a domain found. Taking a global
        tail and filtering it client-side meant only the newest missions had any
        activity at all: 25 missions, and the last 400 events covered 3 of them.
        Every older mission rendered as though its agents had found nothing.
        """
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()
        if mission_id:
            # Substring first: cheap reject before paying for a JSON parse.
            lines = [line for line in lines if mission_id in line]
        out = []
        for line in lines[-limit:]:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if mission_id and record.get("mission_id") != mission_id:
                continue
            out.append(record)
        return out
