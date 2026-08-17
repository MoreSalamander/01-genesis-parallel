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
from collections import Counter
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

    # A blind tail hides exactly the edges worth seeing. One mission writes
    # hundreds of source/evidence/claim edges and at most a handful of
    # objective→gap edges, so the rarest kinds are always the first crowded out:
    # the follow-up questions the deepen loop raised sat in this file at line
    # 6,547 of 7,296 while the console asked for the last 400, and the context
    # graph showed no follow-up questions for weeks even though every one of
    # them had been recorded.
    #
    # So recency still sets the bulk of the window, but each kind present in the
    # file is guaranteed a floor of its most recent edges. Bounded by
    # limit + kinds x floor, and the payload stays in file order either way.
    def relationships(self, limit: int = 200, per_kind_floor: int = 12) -> list[dict]:
        if not self.relationships_path.exists():
            return []

        records: list[tuple[int, dict]] = []
        for pos, line in enumerate(self.relationships_path.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            try:
                records.append((pos, json.loads(line)))
            except json.JSONDecodeError:
                continue  # a half-written line must not blank the whole graph

        keep: dict[int, dict] = dict(records[-limit:]) if limit > 0 else {}
        held = Counter()
        for record in keep.values():
            for kind in (record.get("src_kind"), record.get("dst_kind")):
                if kind:
                    held[kind] += 1

        # Newest first, so a kind's floor is filled with its most recent edges.
        for pos, record in reversed(records[: -limit or None]):
            kinds = [k for k in (record.get("src_kind"), record.get("dst_kind")) if k]
            if any(held[kind] < per_kind_floor for kind in kinds):
                keep[pos] = record
                for kind in kinds:
                    held[kind] += 1

        return [record for _, record in sorted(keep.items())]

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
            assertion = {
                "claim": claim.text,
                "status": claim.status.value,
                "disputed": claim.status == VerificationStatus.CONFLICTED,
                "conflict_detail": claim.conflict_detail,
                "corroborating_sources": claim.corroborating_sources,
                "mission_id": mission.id,
                "claim_id": claim.id,
                "at": now,
            }
            # One claim is one thing the studio knows, however many times it is
            # promoted. This runs again on every deepening round, and appending
            # blindly wrote the same claim two, three, four times: 151 of 343
            # entities carried duplicates, so the world model reported more
            # knowledge than it held and the console keyed two cards off one
            # claim id. Re-promoting refreshes the assertion in place — which is
            # also correct, because the second pass may have turned a VERIFIED
            # claim CONFLICTED and that update must land, not accumulate beside
            # the old one.
            existing = next((i for i, a in enumerate(record["assertions"])
                             if a.get("claim_id") == claim.id), None)
            if existing is None:
                record["assertions"].append(assertion)
            else:
                assertion["at"] = record["assertions"][existing].get("at", now)
                record["assertions"][existing] = assertion
            touched.add(claim.entity)
            self._relate("claim", claim.id, "about", "entity", claim.entity, mission.id)
            for evidence_id in claim.evidence_ids:
                self._relate("evidence", evidence_id, "supports", "claim", claim.id, mission.id)

        for evidence in mission.evidence:
            self._relate("source", evidence.source_id, "produced", "evidence", evidence.id, mission.id)
        for finding in mission.findings:
            self._relate("objective", mission.id, "generated", "finding", finding.id, mission.id)
            # The half of the chain that was missing. Without this the graph
            # held two disconnected halves — source→evidence→claim→entity, and
            # objective→finding→recommendation — with no path between them, so
            # it could not answer "what evidence is under this recommendation?"
            # That is the question this system exists to answer, and it is also
            # what makes a shortfall locatable: a finding with no verified claim
            # beneath it is a hole in a specific place, not a general doubt.
            for claim_id in finding.claim_ids:
                self._relate("finding", finding.id, "rests on", "claim", claim_id, mission.id)
            if mission.recommendation:
                self._relate("finding", finding.id, "supports", "recommendation", mission.recommendation.id, mission.id)

        self.entities_path.parent.mkdir(parents=True, exist_ok=True)
        self.entities_path.write_text(json.dumps(entities, indent=2, ensure_ascii=False), encoding="utf-8")
        return sorted(touched)

    def relate(self, src_kind: str, src: str, rel: str, dst_kind: str, dst: str, mission_id: str) -> None:
        """Record one provenance link from outside the ingest path.

        The follow-up loop uses this to record that an objective raised a gap,
        so the context graph can show why the search went where it did.
        """
        self._relate(src_kind, src, rel, dst_kind, dst, mission_id)

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
