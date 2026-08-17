"""Where the answer is thin, read off the provenance graph.

The sufficiency audit asks the model whether its own answer is good enough.
That is self-assessment, and self-assessment fails in the flattering direction.
This does not ask anyone. It walks the chain the store recorded —

    source ──produced──> evidence ──supports──> claim
    claim ──about──> entity
    finding ──rests on──> claim
    finding ──supports──> recommendation

— and reports the places where it runs out. A finding with no verified claim
beneath it is not a matter of opinion: the edge is absent. An entity the answer
leans on with nothing asserted about it is absent in the same checkable way.

So the two audits do different jobs. The graph says *where* the answer is
unsupported and can be trusted about it. The model says *what to go and ask* to
fix it, which is a judgement call the graph cannot make. Neither is sufficient
alone: a graph cannot notice that "top 10" wanted ten of something, and a model
asked to grade its own work will tell you it did fine.

"Context filled" is then a condition with an answer rather than an opinion:
every finding rests on something verified, and nothing the answer names is
unsupported.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.models.evidence import Mission, VerificationStatus


@dataclass
class Hole:
    """One located shortfall. `where` is the node, not a vague area."""
    kind: str            # unsupported_finding | thin_claim | unknown_entity | unsupported_recommendation
    where: str           # the id or name of the node that is short
    detail: str          # what is missing, in words
    subject: str         # what to research to close it

    def as_question(self) -> str:
        return self.subject


@dataclass
class Coverage:
    holes: list[Hole] = field(default_factory=list)
    findings_total: int = 0
    findings_supported: int = 0
    claims_total: int = 0
    claims_corroborated: int = 0

    @property
    def filled(self) -> bool:
        return not self.holes

    def summary(self) -> str:
        if self.findings_total == 0:
            return "nothing assembled yet"
        return (
            f"{self.findings_supported} of {self.findings_total} findings rest on verified claims; "
            f"{self.claims_corroborated} of {self.claims_total} claims have more than one source"
        )


def assess(mission: Mission) -> Coverage:
    """Walk the mission's own chain and report where it runs out."""
    by_id = {c.id: c for c in mission.claims}
    verified_ids = {
        c.id for c in mission.claims
        if c.status in (VerificationStatus.VERIFIED, VerificationStatus.CONFLICTED)
    }

    cov = Coverage(
        findings_total=len(mission.findings),
        claims_total=len(mission.claims),
        claims_corroborated=sum(1 for c in mission.claims if c.corroborating_sources > 1),
    )

    for finding in mission.findings:
        supporting = [cid for cid in finding.claim_ids if cid in verified_ids]
        if supporting:
            cov.findings_supported += 1
            continue
        # A finding the studio is being asked to act on, with nothing verified
        # underneath it. The location is exact, so the follow-up can be too.
        cov.holes.append(Hole(
            kind="unsupported_finding",
            where=finding.id,
            detail=(f"'{finding.text[:80]}' rests on no verified claim"
                    if finding.claim_ids else
                    f"'{finding.text[:80]}' cites no claim at all"),
            subject=f"What is the evidence for: {finding.text[:140]}?",
        ))

    # A single-source claim carrying a high-impact finding is the thin ice worth
    # naming — one page said it and nothing else agreed or disagreed.
    for finding in mission.findings:
        if finding.strategic_impact.value != "HIGH":
            continue
        for cid in finding.claim_ids:
            claim = by_id.get(cid)
            if claim is None or claim.corroborating_sources > 1:
                continue
            cov.holes.append(Hole(
                kind="thin_claim",
                where=claim.id,
                detail=f"'{claim.text[:70]}' rests on a single source",
                subject=f"Is this corroborated elsewhere: {claim.text[:140]}?",
            ))
            break   # one per finding is enough to send a researcher back out

    if mission.recommendation and not mission.recommendation.finding_ids:
        cov.holes.append(Hole(
            kind="unsupported_recommendation",
            where=mission.recommendation.id,
            detail="the recommendation cites no findings",
            subject=f"What supports this course of action: {mission.recommendation.action[:140]}?",
        ))

    return cov
