"""Evidence lineage chain (locked §5) holds together as data."""
from app.models.evidence import (
    Claim,
    Evidence,
    Finding,
    Mission,
    Observation,
    Recommendation,
    Source,
    VerificationStatus,
    Domain,
)


def test_lineage_chain_construction():
    source = Source(url="https://example.com/a", title="A")
    observation = Observation(source_id=source.id, statement="Company X raised $10M")
    evidence = Evidence(
        observation_id=observation.id,
        source_id=source.id,
        claim_text="Company X raised $10M",
        related_entities=["Company X"],
    )
    claim = Claim(text="Company X raised $10M", entity="Company X", evidence_ids=[evidence.id])
    finding = Finding(domain=Domain.MARKET, text="Company X is expanding", claim_ids=[claim.id])
    rec = Recommendation(mission_id="msn_x", action="Monitor Company X", rationale="...", confidence=0.8,
                         finding_ids=[finding.id])

    assert evidence.verification_status == VerificationStatus.UNVERIFIED
    assert claim.evidence_ids == [evidence.id]
    assert rec.requires_authorization is True


def test_mission_stages_and_counts():
    mission = Mission(objective="Test objective for staging")
    mission.stage("MISSION ACCEPTED", "detail")
    mission.claims.append(Claim(text="a", status=VerificationStatus.VERIFIED))
    mission.claims.append(Claim(text="b", status=VerificationStatus.CONFLICTED))
    mission.claims.append(Claim(text="c", status=VerificationStatus.UNVERIFIED))
    assert [s.name for s in mission.stages] == ["MISSION ACCEPTED"]
    assert len(mission.verified_claims) == 1
    assert len(mission.conflicted_claims) == 1
