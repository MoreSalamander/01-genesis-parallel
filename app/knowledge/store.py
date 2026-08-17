"""Institutional knowledge + provenance graph (locked §4, §10).

Not everything graduates (§10): VERIFIED claims are promoted into institutional
knowledge; CONFLICTED claims are stored as explicitly disputed; UNVERIFIED
claims remain in episodic memory only.

The graph vocabulary follows §4:
    Source ──produced──> Evidence ──supports──> Claim ──about──> Entity
    Objective ──generated──> Finding ──supports──> Recommendation

Storage is a local JSON graph by default; when DATAHUB_GMS_URL is configured the
same writes are mirrored to DataHub (see knowledge/datahub/emitter.py).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.models.evidence import Mission, VerificationStatus

_COMPANY_MARKERS = ("studio", "studios", "collective", "ventures", "pictures", "films", "media", "inc", "labs")


# Values extraction uses to mean "no entity here". They must never become
# nodes in the world model.
_NON_ENTITIES = {
    "", "-", "—", "n/a", "n.a.", "na", "none", "null", "nil",
    "unknown", "unspecified", "not specified", "not applicable",
    "various", "multiple", "tbd", "tba",
}


def _entity_type(name: str) -> str:
    lowered = name.lower()
    if any(marker in lowered for marker in _COMPANY_MARKERS):
        return "Company"
    return "Person" if len(name.split()) == 2 else "Organization"


class LocalGraphStore:
    def __init__(self, data_dir: Path):
        self.entities_path = data_dir / "knowledge_entities.json"
        self.relationships_path = data_dir / "knowledge_relationships.jsonl"

    # -- reads ---------------------------------------------------------------
    def entities(self) -> dict:
        if self.entities_path.exists():
            return json.loads(self.entities_path.read_text(encoding="utf-8"))
        return {}

    def relationships(self, limit: int = 200) -> list[dict]:
        if not self.relationships_path.exists():
            return []
        lines = self.relationships_path.read_text(encoding="utf-8").splitlines()[-limit:]
        return [json.loads(line) for line in lines]

    # -- writes --------------------------------------------------------------
    def ingest_mission(self, mission: Mission) -> list[str]:
        """Promote qualifying claims into durable knowledge. Returns touched entity names."""
        entities = self.entities()
        touched: set[str] = set()
        now = datetime.now(timezone.utc).isoformat()

        for claim in mission.claims:
            # Extraction emits a placeholder when it found no entity at all, and
            # a placeholder is not a thing the studio knows about. Promoting
            # them put a company called "N/A" in the world model carrying seven
            # assertions, drawn as one of the larger nodes in the graph.
            if not claim.entity or claim.entity.strip().lower() in _NON_ENTITIES:
                continue
            if claim.status == VerificationStatus.UNVERIFIED:
                continue  # stays episodic only (§10)
            record = entities.setdefault(
                claim.entity,
                {"name": claim.entity, "type": _entity_type(claim.entity), "first_seen": now, "assertions": []},
            )
            record["last_updated"] = now
            record["assertions"].append(
                {
                    "claim": claim.text,
                    "status": claim.status.value,
                    "disputed": claim.status == VerificationStatus.CONFLICTED,
                    "conflict_detail": claim.conflict_detail,
                    "corroborating_sources": claim.corroborating_sources,
                    "mission_id": mission.id,
                    "claim_id": claim.id,
                    "at": now,
                }
            )
            touched.add(claim.entity)
            self._relate("claim", claim.id, "about", "entity", claim.entity, mission.id)
            for evidence_id in claim.evidence_ids:
                self._relate("evidence", evidence_id, "supports", "claim", claim.id, mission.id)

        for evidence in mission.evidence:
            self._relate("source", evidence.source_id, "produced", "evidence", evidence.id, mission.id)
        for finding in mission.findings:
            self._relate("objective", mission.id, "generated", "finding", finding.id, mission.id)
            if mission.recommendation:
                self._relate("finding", finding.id, "supports", "recommendation", mission.recommendation.id, mission.id)

        self.entities_path.parent.mkdir(parents=True, exist_ok=True)
        self.entities_path.write_text(json.dumps(entities, indent=2, ensure_ascii=False), encoding="utf-8")
        return sorted(touched)

    def _relate(self, src_kind: str, src: str, rel: str, dst_kind: str, dst: str, mission_id: str) -> None:
        self.relationships_path.parent.mkdir(parents=True, exist_ok=True)
        with self.relationships_path.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {"src_kind": src_kind, "src": src, "rel": rel, "dst_kind": dst_kind, "dst": dst,
                     "mission_id": mission_id},
                    ensure_ascii=False,
                )
                + "\n"
            )
