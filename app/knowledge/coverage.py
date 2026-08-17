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
# The same placeholders the store refuses to promote — kept in one place so the
# audit cannot start asking research questions about "n/a".
from app.knowledge.store import _NON_ENTITIES


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
    # Directions the graph suggests that are NOT defects of this answer: a peer
    # the studio tracks in the same space, or a question its own record already
    # holds open. These deliberately do not count against `filled` — an answer
    # is not incomplete because more could always be asked, and treating leads
    # as shortfalls would mean no mission ever finished while a metered API ran.
    leads: list[Hole] = field(default_factory=list)
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


_UNKNOWN_ENTITY_LIMIT = 4   # one answer fans out; it does not flood
_LEAD_LIMIT = 2             # and leads are suggestions, not a second mission


def assess(mission: Mission, knowledge=None) -> Coverage:
    """Walk the mission's own chain and report where it runs out.

    `knowledge` is the context graph (LocalGraphStore). Given it, the audit can
    also ask what the studio already knows about the things this answer leans
    on — which is what turns one answer into several different questions rather
    than several versions of the same one. Optional, so the mission-only audit
    still works with no store attached.
    """
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

    # Read the graph once, keyed case-insensitively: claim entities come from
    # extraction and will not always match the store's casing.
    known: dict = {}
    if knowledge is not None:
        try:
            known = {name.lower(): dict(record, name=record.get("name", name))
                     for name, record in knowledge.entities().items()}
        except Exception:      # a graph outage must not fail the audit (§12)
            known = {}

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

    # The answer names entities; the context graph knows which of them the studio
    # has nothing confirmed about. This is the fan-out: each such entity is a
    # different direction to go and ask in, so one answer raises several
    # questions about several things instead of one question three times. It is
    # checkable in the same way as the rest — only VERIFIED claims are promoted
    # (§10), so an entity with nothing verified in the store is precisely one
    # this answer rests on without anything confirmed underneath it.
    #
    # Each round's research promotes what it confirmed, so the next answer meets
    # a different graph and raises different questions. That is the chain.
    if knowledge is not None:
        raised: set[str] = set()
        for claim in mission.claims:
            if len(raised) >= _UNKNOWN_ENTITY_LIMIT:
                break
            name = (claim.entity or "").strip()
            key = name.lower()
            # Extraction emits placeholders for "no entity here"; they are not
            # things to go and research.
            if not name or key in _NON_ENTITIES or key in raised:
                continue
            record = known.get(key) or {}
            # Anything recorded at all means the studio is not blank on this —
            # §10 promotes CONFLICTED claims too, stored as explicitly disputed.
            # A disputed entity is known and unresolved, which is a lead to
            # continue rather than a hole to fill, and counting it both ways had
            # the audit contradicting itself about the same company.
            if record.get("assertions"):
                continue
            raised.add(key)
            cov.holes.append(Hole(
                kind="unknown_entity",
                where=name,
                detail=(f"the answer leans on '{name[:60]}' and the studio has nothing "
                        f"confirmed about it"),
                subject=f"What is independently confirmed about {name[:120]}?",
            ))

    if mission.recommendation and not mission.recommendation.finding_ids:
        cov.holes.append(Hole(
            kind="unsupported_recommendation",
            where=mission.recommendation.id,
            detail="the recommendation cites no findings",
            subject=f"What supports this course of action: {mission.recommendation.action[:140]}?",
        ))

    if knowledge is not None:
        _leads(mission, cov, known)

    return cov


def _leads(mission: Mission, cov: Coverage, known: dict) -> None:
    """Where the answer could go next, read off the same graph.

    Holes say where this answer is thin. These say what else is worth asking
    now that it exists — the two things a researcher does after an answer
    lands: look at the like things, and continue the thread that is still open.
    Both are read from the store rather than invented, so they name something
    real or they are not raised at all.
    """
    touched = {(c.entity or "").strip().lower() for c in mission.claims}
    touched.discard("")

    # Continued research: the studio's own record already disagrees with itself
    # about something this answer leans on. That is an open question it is
    # holding, not a defect of this answer — and it is exactly the thread a
    # researcher would pull next.
    for key in list(touched)[:_LEAD_LIMIT]:
        record = known.get(key) or {}
        disputed = [a for a in record.get("assertions", []) if a.get("disputed")]
        if not disputed:
            continue
        cov.leads.append(Hole(
            kind="open_dispute",
            where=record.get("name", key),
            detail=(f"the studio's record disagrees with itself about "
                    f"'{record.get('name', key)[:60]}'"),
            subject=(f"What settles the disagreement about "
                     f"{disputed[0].get('claim', record.get('name', key))[:130]}?"),
        ))

    # Like things: peers the studio already tracks in the same category that
    # this answer never looked at. The graph knows they are alike because it
    # recorded the type; nothing here is inferred from the names.
    types = {
        (known.get(key) or {}).get("type")
        for key in touched
        if (known.get(key) or {}).get("type")
    }
    peers = [
        record for name, record in known.items()
        if record.get("type") in types and name not in touched
    ][:_LEAD_LIMIT]
    for record in peers:
        cov.leads.append(Hole(
            kind="like_thing",
            where=record.get("name", ""),
            detail=(f"the studio tracks '{record.get('name', '')[:60]}' in the same "
                    f"category and this answer did not look at it"),
            subject=(f"How does {record.get('name', '')[:120]} compare here, given "
                     f"{mission.objective[:80]}?"),
        ))
