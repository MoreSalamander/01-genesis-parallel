"""Verification cognition (locked §6). Discovery ≠ knowledge: candidate evidence
is grouped and corroborated before anything is promoted.

States are derived deterministically from corroboration structure — cognition
proposes the grouping/contradictions, but status assignment follows fixed rules
so LIVE mode cannot hand-wave a status:

    contradiction in group      → CONFLICTED (disagreement preserved, §6)
    ≥2 distinct sources agree   → VERIFIED
    otherwise                   → UNVERIFIED
"""
from __future__ import annotations

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

            claim = Claim(
                text=group.get("claim", members[0].claim_text),
                entity=group.get("entity", ""),
                evidence_ids=[m.id for m in members],
                corroborating_sources=len(distinct_sources),
                status=status,
                conflict_detail=group.get("contradiction_detail", ""),
            )
            for member in members:
                member.verification_status = status
            mission.claims.append(claim)

            if status == VerificationStatus.VERIFIED:
                self.bus.emit("claim.verified", mission_id=mission.id, claim_id=claim.id,
                              claim=claim.text, sources=claim.corroborating_sources)
            elif status == VerificationStatus.CONFLICTED:
                self.bus.emit("claim.conflicted", mission_id=mission.id, claim_id=claim.id,
                              claim=claim.text, detail=claim.conflict_detail)
