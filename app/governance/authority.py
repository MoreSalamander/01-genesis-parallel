"""Human authority boundary (locked §11) and separation of duties (§13).

The system may autonomously research, verify, build knowledge, and recommend.
Anything consequential requires the Studio Head. Recommendations never
self-execute; the decision endpoint records the human decision and nothing else
performs external actions in this standalone system.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.events.bus import EventBus
from app.models.evidence import Mission, MissionStatus

AUTONOMOUS_ACTIONS = {
    "search", "research", "verify", "build_knowledge", "rank", "recommend", "monitor",
}

REQUIRES_AUTHORIZATION = {
    "contact_company", "contact_talent", "acquisition_activity", "external_communication",
    "commit_funds", "contractual_obligation", "strategy_change", "execute_recommendation",
}

VALID_DECISIONS = {"approved", "rejected", "more_research"}

_DECISION_STATUS = {
    "approved": MissionStatus.APPROVED,
    "rejected": MissionStatus.REJECTED,
    "more_research": MissionStatus.MORE_RESEARCH_REQUESTED,
}


class AuthorityError(PermissionError):
    pass


def ensure_autonomous(action: str) -> None:
    if action in REQUIRES_AUTHORIZATION:
        raise AuthorityError(f"'{action}' requires Studio Head authorization (§11)")
    if action not in AUTONOMOUS_ACTIONS:
        raise AuthorityError(f"'{action}' is not a recognized autonomous action")


def record_decision(mission: Mission, decision: str, bus: EventBus) -> Mission:
    if mission.recommendation is None:
        raise AuthorityError("No recommendation awaiting a decision on this mission")
    if decision not in VALID_DECISIONS:
        raise AuthorityError(f"Decision must be one of {sorted(VALID_DECISIONS)}")
    mission.recommendation.decision = decision
    mission.recommendation.decided_at = datetime.now(timezone.utc)
    mission.status = _DECISION_STATUS[decision]
    mission.stage("STUDIO HEAD DECISION", decision.upper())
    bus.emit("authorization.decided", mission_id=mission.id,
             recommendation_id=mission.recommendation.id, decision=decision)
    return mission
