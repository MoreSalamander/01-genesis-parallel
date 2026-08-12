"""End-to-end mission in mock mode (clean clone, no keys): the locked §15 MVP
flow — objective → plan → research → verify → knowledge → assess → recommend →
Studio Head decision — with events and knowledge promotion observable."""
from app.governance.authority import AuthorityError, record_decision
from app.models.evidence import MissionStatus
from app.workflows.run_mission import get_runtime, run_mission, start_mission

import pytest


def test_full_mission_mock_mode():
    mission = start_mission("Find emerging production companies worth monitoring")
    run_mission(mission.id)

    runtime = get_runtime()
    mission = runtime.working.get(mission.id)

    assert mission.status == MissionStatus.RECOMMENDED, mission.error
    assert len(mission.sources) >= 4
    assert len(mission.evidence) >= 5
    assert len(mission.verified_claims) >= 1
    assert len(mission.conflicted_claims) >= 1  # disputed funding amount is preserved
    assert mission.recommendation is not None
    assert 0.0 < mission.recommendation.confidence <= 1.0
    assert mission.findings

    stage_names = [s.name for s in mission.stages]
    for expected in ("MISSION ACCEPTED", "PLANNED", "RESEARCHED", "VERIFIED", "RECOMMENDED"):
        assert expected in stage_names

    event_names = {e["event"] for e in runtime.bus.tail(500)}
    assert {"signal.discovered", "evidence.created", "claim.verified", "claim.conflicted",
            "recommendation.created", "intelligence.completed"} <= event_names

    # Knowledge promotion: VERIFIED/CONFLICTED graduate, provenance recorded
    entities = runtime.knowledge.entities()
    assert entities, "verified claims should promote entities into institutional knowledge"
    assert runtime.knowledge.relationships(limit=10)

    # Studio Head boundary (§11)
    with pytest.raises(AuthorityError):
        record_decision(mission, "launch_acquisition", runtime.bus)
    record_decision(mission, "approved", runtime.bus)
    assert mission.status == MissionStatus.APPROVED
    assert mission.recommendation.decision == "approved"
