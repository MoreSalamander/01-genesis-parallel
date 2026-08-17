"""The follow-up loop: an answer that names something it does not have is not
an answer yet.

The failure this exists to prevent is concrete. Asked for "faceless ideas top
10", the system returned "initiate a pilot program ... prioritizing niche
selection based on verified high CPM/low competition data" — a recommendation
to go and find the answer, holding exactly one CPM figure, disputed. It had
named its own missing input and stopped.

These run on the deterministic cognition so they need no credentials and no
quota.
"""
from __future__ import annotations

import pytest

from app.tools.google.gemini import MockCognition


@pytest.fixture
def brain() -> MockCognition:
    return MockCognition()


def test_asking_for_ten_and_listing_none_is_not_fulfilled(brain):
    verdict = brain.generate_json("sufficiency_check", {
        "objective": "convergence studios is starting a youtube channel. faceless ideas top 10",
        "recommendation": "Initiate a pilot program focused on developing a high-quality, "
                          "editorialized faceless listicle channel.",
        "findings": ["Listicles are a top-performing faceless niche."],
        "verified_claims": ["Listicles are a top YouTube niche for faceless channels."],
    })
    assert verdict["fulfilled"] is False
    assert verdict["gaps"], "a shortfall with no follow-up question cannot be closed"
    assert any("10" in g["question"] for g in verdict["gaps"])


def test_prioritising_by_a_criterion_it_never_measured_is_not_fulfilled(brain):
    """The specific dishonesty worth catching: the answer leans on CPM data to
    justify itself while holding none."""
    verdict = brain.generate_json("sufficiency_check", {
        "objective": "which faceless niche should we pick?",
        "recommendation": "Prioritise niche selection based on verified high CPM and low competition.",
        "findings": [],
        "verified_claims": ["Murf creates natural-sounding voiceovers."],
    })
    assert verdict["fulfilled"] is False
    assert any("CPM" in g["question"] for g in verdict["gaps"])
    assert any("no verified claim measures it" in g["why"] for g in verdict["gaps"])


def test_a_measured_criterion_is_not_reported_as_a_gap(brain):
    """It must not manufacture work. If the evidence actually measures the
    thing, that is not a shortfall."""
    verdict = brain.generate_json("sufficiency_check", {
        "objective": "what does a short film cost?",
        "recommendation": "Budget around $40,000 based on the verified cost figures below.",
        "findings": ["Short film budgets cluster between $30k and $50k."],
        "verified_claims": ["Average short film cost in 2026 is $38,000 per finished minute."],
    })
    assert verdict["fulfilled"] is True
    assert verdict["gaps"] == []


def test_an_enumerated_answer_satisfies_a_count(brain):
    listed = "\n".join(f"{i}. Niche {i}" for i in range(1, 11))
    verdict = brain.generate_json("sufficiency_check", {
        "objective": "give me the top 10 faceless ideas",
        "recommendation": f"The ten strongest options are:\n{listed}",
        "findings": [],
        "verified_claims": [],
    })
    assert verdict["fulfilled"] is True


def test_the_loop_is_bounded():
    """It must terminate. An unbounded deepening loop against a paid retrieval
    API is a runaway bill, not a feature."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive

    assert Executive.MAX_ROUNDS >= 2, "no room to follow anything up"
    assert Executive.MAX_ROUNDS <= 5, "too many rounds to be safe against a metered API"


def test_deepen_runs_as_its_own_durable_step():
    """The executive's run() convenience path is not what executes in
    production — the Temporal workflow is. A follow-up stage that only exists
    in run() silently never happens, which is exactly what happened first time.
    """
    from app.workflows.temporal_activities import ALL_ACTIVITIES
    from app.workflows import temporal_workflows

    names = {getattr(a, "__temporal_activity_definition").name for a in ALL_ACTIVITIES}
    assert "signal.deepen" in names, "deepen is not registered with the worker"

    import inspect

    source = inspect.getsource(temporal_workflows)
    assert '"signal.deepen"' in source, "the workflow never calls deepen"
    assert source.index('"signal.deepen"') < source.index('"signal.complete"'), \
        "deepening must happen before the mission is closed"


# --- the graph half: where the chain runs out --------------------------------
# These need no model at all. That is the point: a missing edge is checkable,
# and unlike a model grading its own work it cannot fail in the flattering
# direction.

from app.knowledge import coverage  # noqa: E402
from app.models.evidence import (  # noqa: E402
    Claim, Domain, Finding, Mission, Recommendation, StrategicImpact, VerificationStatus,
)


def _mission_with(claims, findings, recommendation=None) -> Mission:
    m = Mission(objective="test")
    m.claims = claims
    m.findings = findings
    m.recommendation = recommendation
    return m


def test_a_finding_resting_on_nothing_verified_is_a_located_hole():
    claim = Claim(text="unconfirmed thing", entity="X",
                  status=VerificationStatus.UNVERIFIED, corroborating_sources=1)
    finding = Finding(domain=Domain.MARKET, text="Act on the unconfirmed thing",
                      claim_ids=[claim.id], strategic_impact=StrategicImpact.HIGH)
    cov = coverage.assess(_mission_with([claim], [finding]))

    assert not cov.filled
    hole = next(h for h in cov.holes if h.kind == "unsupported_finding")
    # Located, not vague: it names the node that is short.
    assert hole.where == finding.id
    assert "Act on the unconfirmed thing" in hole.as_question()


def test_a_verified_chain_reports_filled():
    claim = Claim(text="confirmed thing", entity="X",
                  status=VerificationStatus.VERIFIED, corroborating_sources=3)
    finding = Finding(domain=Domain.MARKET, text="Act on the confirmed thing",
                      claim_ids=[claim.id], strategic_impact=StrategicImpact.HIGH)
    rec = Recommendation(mission_id="m", action="do it", rationale="because",
                         confidence=0.8, finding_ids=[finding.id])
    cov = coverage.assess(_mission_with([claim], [finding], rec))

    assert cov.filled, [h.detail for h in cov.holes]
    assert cov.findings_supported == 1


def test_a_high_impact_finding_on_one_source_is_flagged_as_thin():
    claim = Claim(text="only one page said this", entity="X",
                  status=VerificationStatus.VERIFIED, corroborating_sources=1)
    finding = Finding(domain=Domain.MARKET, text="Bet the studio on it",
                      claim_ids=[claim.id], strategic_impact=StrategicImpact.HIGH)
    cov = coverage.assess(_mission_with([claim], [finding]))

    assert any(h.kind == "thin_claim" and h.where == claim.id for h in cov.holes)


def test_a_recommendation_citing_no_findings_is_a_hole():
    rec = Recommendation(mission_id="m", action="do something", rationale="",
                         confidence=0.5, finding_ids=[])
    cov = coverage.assess(_mission_with([], [], rec))

    assert any(h.kind == "unsupported_recommendation" for h in cov.holes)


def test_the_graph_records_the_link_the_audit_walks():
    """coverage.assess reads finding.claim_ids, and the store must write that
    same link as an edge — otherwise the console's graph and the audit disagree
    about what supports what."""
    import inspect

    from app.knowledge import store

    src = inspect.getsource(store)
    assert '"finding", finding.id, "rests on", "claim"' in src, \
        "finding→claim edge missing: the provenance chain stays in two halves"


def test_a_rare_kind_survives_a_busy_file(tmp_path):
    """The loop can raise gaps, record them, and still show the Studio Head
    nothing. A mission writes hundreds of source/evidence edges and a handful of
    objective->gap edges, so a plain tail returns a window with no gap in it —
    which is exactly what shipped: gap edges at line 6,547 of 7,296 while the
    console asked for the last 400."""
    import json

    from app.knowledge.store import LocalGraphStore

    path = tmp_path / "knowledge_relationships.jsonl"
    lines = [json.dumps({"src_kind": "objective", "src": "m1", "rel": "raised",
                         "dst_kind": "gap", "dst": f"what about {i}?", "mission_id": "m1"})
             for i in range(3)]
    lines += [json.dumps({"src_kind": "source", "src": f"s{i}", "rel": "produced",
                          "dst_kind": "evidence", "dst": f"e{i}", "mission_id": "m2"})
              for i in range(2000)]
    path.write_text("\n".join(lines), encoding="utf-8")

    rels = LocalGraphStore(tmp_path).relationships(limit=400)

    assert [r for r in rels if r["dst_kind"] == "gap"], \
        "follow-up questions fell outside the window — the graph cannot show what it never receives"
    assert len(rels) < len(lines), "the window must stay bounded, not return the whole file"


def test_an_older_missions_events_are_still_reachable(tmp_path):
    """The console reads per-agent activity out of the event log. A global tail
    covered only the newest missions — 25 missions, last 400 events spanning 3 —
    so every older mission rendered as though its agents had found nothing."""
    import json

    from app.events.bus import EventBus

    path = tmp_path / "events.jsonl"
    old = [json.dumps({"event": "evidence.created", "mission_id": "old",
                       "specialist": "Audience Agent", "count": 4})]
    noise = [json.dumps({"event": "signal.discovered", "mission_id": "new", "source_id": f"s{i}"})
             for i in range(900)]
    path.write_text("\n".join(old + noise), encoding="utf-8")

    bus = EventBus(tmp_path)
    assert bus.tail(400, mission_id="old"), "the mission's own events must be reachable"
    assert all(e["mission_id"] == "old" for e in bus.tail(400, mission_id="old"))
    assert len(bus.tail(400)) == 400, "the unfiltered tail must stay a tail"


def test_a_gap_is_not_asked_twice():
    """A hole the last round failed to close is still a hole, so the audit names
    it again — and the loop researched the identical question twice. One real
    mission raised 8 follow-ups of which only 6 were distinct, spending a metered
    retrieval call to re-read the same corpus for the same answer.

    Driven through _deepen itself rather than asserted against its source: the
    claim is about what the loop does across rounds, not how it is written."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive
    from app.models.evidence import Source

    same_gap = {"question": "What is the CPM for this niche?", "why": "nothing measures it"}
    researched: list[list[dict]] = []

    executive = Executive.__new__(Executive)          # no substrates needed for this path
    executive.bus = type("B", (), {"emit": lambda self, *a, **k: None})()
    executive.knowledge = type("K", (), {"relate": lambda self, *a, **k: None})()
    # The audit keeps naming the same shortfall, which is the real-world case:
    # the follow-up ran and did not close it.
    executive._assess_sufficiency = lambda m: {"fulfilled": False, "reason": "short", "gaps": [same_gap]}

    def research(mission, gaps, round_no):
        researched.append([g["question"] for g in gaps])
        mission.sources.append(Source(url=f"https://example.com/{round_no}", title="new"))

    executive._research_gaps = research
    executive._verify = lambda m: None
    executive._build_knowledge = lambda m: None
    executive._synthesize = lambda m: None

    mission = Mission(objective="which faceless niche should we pick?")
    executive._deepen(mission)

    assert researched == [[same_gap["question"]]], \
        f"the same question was researched more than once: {researched}"
    stages = [s.name for s in mission.stages]
    assert "SAME SHORTFALL" in stages, \
        f"a fully-repeated round must be named rather than silently re-run: {stages}"


def test_a_stale_hole_does_not_crowd_out_the_next_question():
    """The chain is meant to move: each round audits the *new* answer and follows
    what it raised. Structural holes regenerate identically for a node nothing
    changed, and the round only carries three of them — so slicing before
    dropping the already-researched ones let three stale questions fill the round
    and hide the rest. The loop then stopped, with a question it had never asked
    still sitting in the audit."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive
    from app.models.evidence import Source

    researched: list[list[str]] = []

    # Four findings, each resting on an unverified claim: four structural holes,
    # one more than a single round can carry.
    claims, findings = [], []
    for n in range(4):
        claim = Claim(text=f"unconfirmed thing {n}", entity="X",
                      status=VerificationStatus.UNVERIFIED, corroborating_sources=1)
        claims.append(claim)
        findings.append(Finding(domain=Domain.MARKET, text=f"Act on unconfirmed thing {n}",
                                claim_ids=[claim.id], strategic_impact=StrategicImpact.HIGH))

    executive = Executive.__new__(Executive)
    executive.bus = type("B", (), {"emit": lambda self, *a, **k: None})()
    executive.knowledge = type("K", (), {"relate": lambda self, *a, **k: None})()
    executive._assess_sufficiency = lambda m: {"fulfilled": False, "reason": "short", "gaps": []}

    def research(mission, gaps, round_no):
        researched.append([g["question"] for g in gaps])
        mission.sources.append(Source(url=f"https://example.com/{round_no}", title="new"))

    executive._research_gaps = research
    executive._verify = lambda m: None
    executive._build_knowledge = lambda m: None
    executive._synthesize = lambda m: None

    mission = Mission(objective="which faceless niche should we pick?")
    mission.claims = claims
    mission.findings = findings
    executive._deepen(mission)

    assert len(researched) >= 2, \
        f"the loop stopped while unasked holes were still open: {researched}"
    asked_all = [q for round_qs in researched for q in round_qs]
    assert len(asked_all) == len(set(asked_all)), f"a question was asked twice: {asked_all}"
    # The point: the round after the first carries questions the first never
    # asked, rather than the same three holes regenerated.
    assert not (set(researched[0]) & set(researched[1])), \
        f"round 3 repeated round 2 instead of advancing: {researched}"
