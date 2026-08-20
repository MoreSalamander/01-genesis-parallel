"""Verification cognition (locked §6). Discovery ≠ knowledge: candidate evidence
is grouped and corroborated before anything is promoted.

States are derived deterministically from corroboration structure — cognition
proposes the grouping/contradictions, but status assignment follows fixed rules
so LIVE mode cannot hand-wave a status:

    contradiction in group      → CONFLICTED (disagreement preserved, §6)
    ≥2 distinct sources agree   → VERIFIED
    otherwise                   → UNVERIFIED

Verification runs again after every round of nested questions, over the whole
evidence list — corroboration a raised question brought back has to meet the
claim it was raised about. So a re-run replaces the picture rather than layering
a second one over it; see `verify`.
"""
from __future__ import annotations

from collections import Counter

from app.events.bus import EventBus
from app.models.evidence import Claim, Mission, VerificationStatus
from app.tools.google.gemini import Cognition


class VerificationAgent:
    name = "Verification Agent"
    permissions = ("read", "analyze")

    def __init__(self, cognition: Cognition, bus: EventBus):
        self.cognition = cognition
        self.bus = bus

    def verify(self, mission: Mission) -> None:
        if not mission.evidence:
            return

        # A second pass used to append beside the first, so the same fact stood
        # twice with the stale copy keeping the status it had before the
        # corroboration arrived: "Spain offers up to a 30% rebate" read
        # UNVERIFIED (1 source) next to VERIFIED (5 sources). The coverage audit
        # then read the stale copy, called the finding unsupported, and spent
        # another metered question re-asking what the last round had answered.
        #
        # Claim identity has to survive the rebuild. The world model upserts an
        # assertion by claim_id (knowledge/store.ingest_mission), so re-issuing a
        # claim with a fresh id would leave the previous promotion standing
        # beside it — the same duplication, one level down. Evidence ids are
        # stable across rounds, so a rebuilt group inherits the id of whichever
        # previous claim held most of its members, and each id is inherited at
        # most once so a group that splits cannot produce two claims sharing one.
        previous: dict[str, str] = {}
        for claim in mission.claims:
            for evidence_id in claim.evidence_ids:
                previous[evidence_id] = claim.id
        inherited: set[str] = set()
        mission.claims = []
        for item in mission.evidence:
            item.verification_status = VerificationStatus.UNVERIFIED

        source_by_id = {s.id: s for s in mission.sources}
        payload_claims = [
            {
                "claim": e.claim_text,
                "entity": (e.related_entities[0] if e.related_entities else ""),
                "source_url": source_by_id[e.source_id].url if e.source_id in source_by_id else "",
            }
            for e in mission.evidence
        ]
        analysis = self.cognition.generate_json("verification_analysis", {"claims": payload_claims})

        for group in analysis.get("groups", []):
            indices = [i for i in group.get("member_indices", []) if 0 <= i < len(mission.evidence)]
            if not indices:
                continue
            members = [mission.evidence[i] for i in indices]
            distinct_sources = {payload_claims[i]["source_url"] for i in indices if payload_claims[i]["source_url"]}
            if group.get("contradiction"):
                status = VerificationStatus.CONFLICTED
            elif len(distinct_sources) >= 2:
                status = VerificationStatus.VERIFIED
            else:
                status = VerificationStatus.UNVERIFIED

            carried = Counter(
                previous[m.id] for m in members
                if m.id in previous and previous[m.id] not in inherited
            )
            claim = Claim(
                text=group.get("claim", members[0].claim_text),
                entity=group.get("entity", ""),
                evidence_ids=[m.id for m in members],
                corroborating_sources=len(distinct_sources),
                status=status,
                conflict_detail=group.get("contradiction_detail", ""),
            )
            if carried:
                claim.id = carried.most_common(1)[0][0]
                inherited.add(claim.id)
            for member in members:
                member.verification_status = status
            mission.claims.append(claim)

            if status == VerificationStatus.VERIFIED:
                self.bus.emit("claim.verified", mission_id=mission.id, claim_id=claim.id,
                              claim=claim.text, sources=claim.corroborating_sources)
            elif status == VerificationStatus.CONFLICTED:
                self.bus.emit("claim.conflicted", mission_id=mission.id, claim_id=claim.id,
                              claim=claim.text, detail=claim.conflict_detail)
