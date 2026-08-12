"""Strategic cognition (locked §2/§18): opportunity / threat / fit / blind-spot
assessment over verified-and-preserved claims, producing an evidence-linked
recommendation for the Studio Head. Recommendations never execute anything (§11).
"""
from __future__ import annotations

from app.events.bus import EventBus
from app.models.evidence import (
    Domain,
    Finding,
    Mission,
    Recommendation,
    StrategicImpact,
)
from app.tools.google.gemini import Cognition


class StrategicCognition:
    name = "Strategic Cognition"
    permissions = ("read", "analyze", "recommend")

    def __init__(self, cognition: Cognition, bus: EventBus):
        self.cognition = cognition
        self.bus = bus

    def assess(self, mission: Mission) -> None:
        payload_claims = [
            {"claim": c.text, "entity": c.entity, "status": c.status.value}
            for c in mission.claims
        ]
        result = self.cognition.generate_json(
            "strategic_assessment",
            {"objective": mission.objective, "claims": payload_claims},
        )

        for item in result.get("findings", []):
            try:
                domain = Domain(item.get("domain", "strategic").strip().lower())
            except ValueError:
                domain = Domain.STRATEGIC
            try:
                impact = StrategicImpact(item.get("impact", "MEDIUM").strip().upper())
            except ValueError:
                impact = StrategicImpact.MEDIUM
            claim_ids = [
                mission.claims[i].id
                for i in item.get("claim_indices", [])
                if isinstance(i, int) and 0 <= i < len(mission.claims)
            ]
            finding = Finding(domain=domain, text=item.get("text", ""), claim_ids=claim_ids, strategic_impact=impact)
            mission.findings.append(finding)
            self.bus.emit("finding.created", mission_id=mission.id, finding_id=finding.id,
                          domain=domain.value, impact=impact.value, text=finding.text)
            if impact == StrategicImpact.HIGH:
                lowered = finding.text.lower()
                event = "threat.detected" if any(w in lowered for w in ("threat", "risk", "loss")) else "opportunity.detected"
                self.bus.emit(event, mission_id=mission.id, finding_id=finding.id, text=finding.text)

        rec = result.get("recommendation", {})
        recommendation = Recommendation(
            mission_id=mission.id,
            action=rec.get("action", "Insufficient evidence for a recommendation."),
            rationale=rec.get("rationale", ""),
            confidence=float(rec.get("confidence", 0.0)),
            finding_ids=[f.id for f in mission.findings],
        )
        mission.recommendation = recommendation
        self.bus.emit("recommendation.created", mission_id=mission.id, recommendation_id=recommendation.id,
                      action=recommendation.action, confidence=recommendation.confidence)
