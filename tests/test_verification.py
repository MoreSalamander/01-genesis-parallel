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


def test_reverification_replaces_rather_than_appends():
    """Prevents: the same fact standing twice, the stale copy keeping the status
    it had before the corroboration arrived.

    A mission verifies again after every round of nested questions, over its whole
    evidence list. Appending left round one's claim beside round two's, so a claim
    a raised question had just corroborated still read UNVERIFIED (1 source) next
    to VERIFIED (2 sources) — and the coverage audit read the stale copy and spent
    another metered question re-asking what had already been answered.
    """
    mission = Mission(objective="does a second pass replace the first")
    _add_evidence(mission, "https://a.example.com", "Acme Studios signed a first-look streamer deal", "Acme Studios")

    verifier = VerificationAgent(MockCognition(), EventBus(settings.data_dir))
    verifier.verify(mission)
    assert len(mission.claims) == 1
    assert mission.claims[0].status == VerificationStatus.UNVERIFIED

    # The nested question comes back with a second source for the same fact.
    _add_evidence(mission, "https://b.example.com", "Acme Studios signed a first-look streamer deal", "Acme Studios")
    verifier.verify(mission)

    assert len(mission.claims) == 1, "the second pass appended instead of replacing"
    assert mission.claims[0].status == VerificationStatus.VERIFIED
    assert mission.claims[0].corroborating_sources == 2


def test_reverification_keeps_claim_identity():
    """Prevents: the world model holding one claim twice under two ids.

    knowledge/store.ingest_mission upserts an assertion by claim_id and runs again
    on every round, so a rebuilt claim carrying a fresh id would leave the previous
    promotion standing beside it — the duplication moved one level down instead of
    fixed.
    """
    mission = Mission(objective="claim ids survive a rebuild")
    _add_evidence(mission, "https://a.example.com", "Acme Studios signed a first-look streamer deal", "Acme Studios")

    verifier = VerificationAgent(MockCognition(), EventBus(settings.data_dir))
    verifier.verify(mission)
    first_id = mission.claims[0].id

    _add_evidence(mission, "https://b.example.com", "Acme Studios signed a first-look streamer deal", "Acme Studios")
    verifier.verify(mission)

    assert mission.claims[0].id == first_id, "the promoted claim would be orphaned in the world model"
    assert len({c.id for c in mission.claims}) == len(mission.claims), "two claims share one id"


def test_reverification_clears_stale_evidence_status():
    """Prevents: an evidence item keeping a status its claim no longer carries.

    Statuses are written onto the evidence as well as the claim, so a rebuild that
    left the old value behind would have the mission page show evidence marked
    VERIFIED under a claim that a later pass found only one source for.
    """
    mission = Mission(objective="evidence statuses are rebuilt too")
    _add_evidence(mission, "https://a.example.com", "Dana Reyes joins Acme Studios as CTO", "Dana Reyes")
    _add_evidence(mission, "https://b.example.com", "Dana Reyes confirmed joining Acme Studios as CTO", "Dana Reyes")

    verifier = VerificationAgent(MockCognition(), EventBus(settings.data_dir))
    verifier.verify(mission)
    assert any(e.verification_status == VerificationStatus.VERIFIED for e in mission.evidence)

    for claim in mission.claims:
        for evidence_id in claim.evidence_ids:
            held = next(e for e in mission.evidence if e.id == evidence_id)
            assert held.verification_status == claim.status
