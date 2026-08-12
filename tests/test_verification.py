"""Verification states (locked §6): corroboration → VERIFIED, credible
disagreement → CONFLICTED (preserved), single-source → UNVERIFIED."""
from app.config import settings
from app.events.bus import EventBus
from app.agents.verification.verifier import VerificationAgent
from app.models.evidence import Evidence, Mission, Observation, Source, VerificationStatus
from app.tools.google.gemini import MockCognition


def _add_evidence(mission: Mission, url: str, claim: str, entity: str) -> None:
    source = next((s for s in mission.sources if s.url == url), None)
    if source is None:
        source = Source(url=url, title=url)
        mission.sources.append(source)
    obs = Observation(source_id=source.id, statement=claim)
    mission.observations.append(obs)
    mission.evidence.append(
        Evidence(observation_id=obs.id, source_id=source.id, claim_text=claim, related_entities=[entity])
    )


def test_verification_states():
    mission = Mission(objective="verify test")
    # Corroborated leadership claim (two distinct sources)
    _add_evidence(mission, "https://a.example.com", "Dana Reyes joins Acme Studios as CTO", "Dana Reyes")
    _add_evidence(mission, "https://b.example.com", "Dana Reyes confirmed joining Acme Studios as CTO", "Dana Reyes")
    # Conflicting funding amounts (same entity/topic, different values)
    _add_evidence(mission, "https://c.example.com", "Acme Studios raised $40M in funding", "Acme Studios")
    _add_evidence(mission, "https://d.example.com", "Acme Studios raise was $25M in funding", "Acme Studios")
    # Single-source claim
    _add_evidence(mission, "https://e.example.com", "Acme Studios signed a first-look streamer deal", "Acme Studios")

    verifier = VerificationAgent(MockCognition(), EventBus(settings.data_dir))
    verifier.verify(mission)

    statuses = {c.status for c in mission.claims}
    assert VerificationStatus.VERIFIED in statuses
    assert VerificationStatus.CONFLICTED in statuses
    assert VerificationStatus.UNVERIFIED in statuses

    conflicted = mission.conflicted_claims[0]
    assert conflicted.conflict_detail  # disagreement preserved, not resolved
    verified = mission.verified_claims[0]
    assert verified.corroborating_sources >= 2
