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


def test_the_graph_turns_one_answer_into_questions_about_different_things():
    """One answer should fan out. Read against the context graph it raises an
    unsupported finding, a claim only one page made, and a company the studio
    has nothing confirmed about — three directions, not one question three
    times. The entity half was described in coverage.py's own docstring and
    listed in Hole.kind from the start, but nothing ever emitted it: assess()
    had no handle on the graph to ask."""
    claim = Claim(text="Halcyon Ventures led the round", entity="Halcyon Ventures",
                  status=VerificationStatus.UNVERIFIED, corroborating_sources=1)
    finding = Finding(domain=Domain.MARKET, text="Back the Halcyon-led slate",
                      claim_ids=[claim.id], strategic_impact=StrategicImpact.HIGH)
    mission = _mission_with([claim], [finding])

    # Nothing confirmed about the entity the answer leans on.
    empty_graph = type("G", (), {"entities": lambda self: {}})()
    kinds = {h.kind for h in coverage.assess(mission, empty_graph).holes}
    assert "unknown_entity" in kinds, "the graph was not asked what the studio knows"
    assert len(kinds) >= 2, f"one answer should raise different kinds of question: {kinds}"

    # And it must not manufacture work: an entity with a verified assertion is
    # not a hole, and the mission-only audit still works with no graph at all.
    known_graph = type("G", (), {"entities": lambda self: {
        "Halcyon Ventures": {"assertions": [{"claim": "led the round", "status": "VERIFIED"}]}}})()
    assert not [h for h in coverage.assess(mission, known_graph).holes if h.kind == "unknown_entity"]
    assert "unknown_entity" not in {h.kind for h in coverage.assess(mission).holes}


def test_a_round_spends_itself_on_different_kinds_of_hole():
    """Taken in arrival order a round fills with three unsupported findings —
    the same question three times, and the reason a stale hole could stall the
    loop. The round rotates through the kinds instead."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive
    from app.models.evidence import Source

    researched: list[list[str]] = []
    claims, findings = [], []
    for n in range(3):
        c = Claim(text=f"thing {n}", entity=f"Company {n}",
                  status=VerificationStatus.UNVERIFIED, corroborating_sources=1)
        claims.append(c)
        findings.append(Finding(domain=Domain.MARKET, text=f"Act on thing {n}",
                                claim_ids=[c.id], strategic_impact=StrategicImpact.HIGH))

    executive = Executive.__new__(Executive)
    executive.bus = type("B", (), {"emit": lambda self, *a, **k: None})()
    executive.knowledge = type("K", (), {"relate": lambda self, *a, **k: None,
                                         "entities": lambda self: {}})()
    executive._assess_sufficiency = lambda m: {"fulfilled": False, "reason": "short", "gaps": []}

    def research(mission, gaps, round_no):
        researched.append([g["question"] for g in gaps])
        mission.sources.append(Source(url=f"https://example.com/{round_no}", title="new"))

    executive._research_gaps = research
    executive._verify = lambda m: None
    executive._build_knowledge = lambda m: None
    executive._synthesize = lambda m: None

    mission = Mission(objective="who should we back?")
    mission.claims = claims
    mission.findings = findings
    executive._deepen(mission)

    first = researched[0]
    assert len(first) == 3
    # Three different shapes of question, not three of one.
    assert len({q.split(":")[0] for q in first}) >= 2, \
        f"the round spent itself on one kind of question: {first}"


def test_the_graph_also_offers_leads_and_they_do_not_block_completion():
    """Not every follow-up is a defect. After an answer lands, a researcher looks
    at the like things and continues the thread that is still open — so the graph
    offers peers it already tracks in the same category, and disagreements its
    own record is holding. These must never count as shortfalls: an answer is not
    incomplete because more could always be asked, and treating leads as holes
    would mean no mission ever finished while a metered API ran."""
    claim = Claim(text="Halcyon led the round", entity="Halcyon Ventures",
                  status=VerificationStatus.VERIFIED, corroborating_sources=3)
    finding = Finding(domain=Domain.MARKET, text="Back it", claim_ids=[claim.id],
                      strategic_impact=StrategicImpact.LOW)
    rec = Recommendation(mission_id="m", action="do it", rationale="because",
                         confidence=0.8, finding_ids=[finding.id])
    mission = _mission_with([claim], [finding], rec)

    graph = type("G", (), {"entities": lambda self: {
        "Halcyon Ventures": {"name": "Halcyon Ventures", "type": "Company",
                             "assertions": [{"claim": "led a $40M round", "status": "CONFLICTED",
                                             "disputed": True}]},
        "Glasshouse Collective": {"name": "Glasshouse Collective", "type": "Company",
                                  "assertions": [{"claim": "x", "status": "VERIFIED"}]},
    }})()
    cov = coverage.assess(mission, graph)

    kinds = {lead.kind for lead in cov.leads}
    assert "open_dispute" in kinds, "the record disagrees with itself and nothing asked why"
    assert "like_thing" in kinds, "a peer the studio already tracks was never offered"
    # The chain holds, so the answer is complete even though leads exist.
    assert cov.filled, f"leads must not be counted as shortfalls: {[h.kind for h in cov.holes]}"


def test_a_raised_question_becomes_its_own_mission():
    """A follow-up is a question, and a question belongs on the board with its
    own answer — the way a typed one does. It must also be marked as raised
    rather than passed off as asked."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive
    from app.models.evidence import Domain, ResearchTask, Source

    saved: list = []
    executive = Executive.__new__(Executive)
    executive.bus = type("B", (), {"emit": lambda self, *a, **k: None})()
    executive.knowledge = type("K", (), {"relate": lambda self, *a, **k: None,
                                         "entities": lambda self: {}})()
    executive.missions = type("W", (), {"put": lambda self, m: saved.append(m)})()
    executive.planner = type("P", (), {"plan": lambda self, obj, ctx, max_tasks=0: [
        ResearchTask(domain=Domain.MARKET, focus=obj, queries=[obj], specialist="Audience Agent")
    ][:max_tasks or 1]})()
    executive._research = lambda m: m.sources.append(Source(url="https://e.com/1", title="t"))
    executive._verify = lambda m: None
    executive._build_knowledge = lambda m: None
    executive._synthesize = lambda m: None
    executive.complete = lambda m: None

    parent = Mission(objective="which faceless niche should we pick?")
    child = executive._raise_as_mission(parent, {"question": "What is the CPM?", "why": "nothing measures it"}, 2)

    assert child is not None and child.objective == "What is the CPM?"
    assert child.raised_by == parent.id, "a raised question must say what raised it"
    assert child.raised_because
    assert saved and saved[0].id == child.id, "the raised mission never reached the board"
    assert child.stages[0].name == "RAISED"


def test_a_raised_mission_does_not_raise_its_own():
    """The bound on the tree. Without it every follow-up spawns follow-ups, and
    each node of that tree is real retrieval against a metered API."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive

    executive = Executive.__new__(Executive)
    executive.knowledge = type("K", (), {"entities": lambda self: {}})()
    called: list = []
    executive._assess_sufficiency = lambda m: called.append("audited") or None

    child = Mission(objective="What is the CPM?", raised_by="msn_parent")
    executive._deepen(child)

    assert called == [], "a raised mission deepened again — the tree is unbounded"
    assert child.stages == [], "it should stop silently, not narrate a round it never ran"


def test_the_context_decides_how_wide_a_raised_question_runs():
    """A fixed width is wrong in both directions. "Is this corroborated
    elsewhere?" is one question, and a wide plan spends most of it re-covering
    the parent's ground. "What is confirmed about this company nobody looked
    at?" is a subject, and two queries answer it with exactly the thin answer
    that raised it. The graph knows which it is."""
    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive

    executive = Executive.__new__(Executive)
    executive.knowledge = type("K", (), {"entities": lambda self: {
        "Netflix": {"name": "Netflix", "type": "Company",
                    "assertions": [{"claim": "x", "status": "VERIFIED"}]},
    }})()

    # A question about something already held: narrow.
    assert executive._width_for({"kind": "thin_claim", "where": "clm_1"}) \
        == Executive.CHILD_TASKS_FOCUSED
    assert executive._width_for({"kind": "like_thing", "where": "Netflix"}) \
        == Executive.CHILD_TASKS_FOCUSED, "the studio holds a record here; no need to run wide"
    # A question about something with nothing behind it: new ground.
    assert executive._width_for({"kind": "unknown_entity", "where": "Glasshouse Collective"}) \
        == Executive.CHILD_TASKS_NEW_GROUND
    # A model-raised gap carries no kind and must not be treated as new ground.
    assert executive._width_for({"question": "what is the CPM?"}) == Executive.CHILD_TASKS_FOCUSED


def test_the_board_tally_names_the_model_that_actually_ran():
    """The engine object on the board reports which model did the work. Taking
    whichever row is newest had it reporting 'fixture (no model called)' while
    139 live calls sat underneath — the one number on that object nobody would
    think to double-check."""
    from collections import Counter

    rows = [{"model": "fixture (no model called)", "live": False},
            *({"model": "gemini-flash-latest", "live": True} for _ in range(139))]
    live_models = Counter(r["model"] for r in rows if r.get("live") and r.get("model"))
    any_models = Counter(r["model"] for r in rows if r.get("model"))
    ranked = live_models or any_models

    assert ranked.most_common(1)[0][0] == "gemini-flash-latest"
    # And with nothing live on record it still names something rather than blank.
    offline = [{"model": "fixture (no model called)", "live": False}]
    ranked_off = (Counter(r["model"] for r in offline if r.get("live"))
                  or Counter(r["model"] for r in offline))
    assert ranked_off.most_common(1)[0][0] == "fixture (no model called)"


def test_promoting_the_same_claim_twice_updates_it_rather_than_duplicating(tmp_path):
    """_build_knowledge runs again on every deepening round, so a claim promoted
    in the first pass is promoted again in the second. Appending blindly wrote it
    twice: 151 of 343 entities carried duplicates, the world model reported more
    knowledge than it held, and the console keyed two cards off one claim id.

    Re-promotion must also carry an updated verdict — a second pass can turn a
    VERIFIED claim CONFLICTED, and that has to land."""
    from app.knowledge.store import LocalGraphStore

    claim = Claim(text="Halcyon led the round", entity="Halcyon Ventures",
                  status=VerificationStatus.VERIFIED, corroborating_sources=3)
    mission = Mission(objective="who funded it?")
    mission.claims = [claim]

    store = LocalGraphStore(tmp_path)
    store.ingest_mission(mission)
    store.ingest_mission(mission)          # the deepening round promotes again

    record = store.entities()["Halcyon Ventures"]
    assert len(record["assertions"]) == 1, \
        f"one claim became {len(record['assertions'])} things the studio knows"

    # Same claim, new verdict: the record must reflect the change in place.
    claim.status = VerificationStatus.CONFLICTED
    claim.conflict_detail = "sources disagree on the amount"
    store.ingest_mission(mission)
    record = store.entities()["Halcyon Ventures"]
    assert len(record["assertions"]) == 1
    assert record["assertions"][0]["status"] == "CONFLICTED"
    assert record["assertions"][0]["disputed"] is True


def test_the_nested_researcher_name_stays_a_key_not_a_label():
    """"Nested questions" is the Studio Head's word for these, and the console
    says it everywhere. But the researcher's recorded name is a key into the
    event log — 61 evidence.created events already carry "follow-up researcher",
    and both the fleet tally and the mission page look it up by exact name.
    Renaming it to match the vocabulary would zero the historical tally, so the
    label is mapped for display and the key is left alone."""
    import inspect

    from app.agents.executive.executive import SignalIntelligenceExecutive as Executive

    src = inspect.getsource(Executive._research_gaps)
    assert 'specialist="follow-up researcher"' in src, \
        "the recorded specialist name changed — every historical tally now under-reports"


def test_nested_questions_are_read_from_the_graph_not_from_dispatched_missions(tmp_path):
    """The tracker read "none yet" for two days while 64 nested questions sat in
    the store. It was looking for missions carrying `raised_by`, which only exists
    on the ones dispatched as their own mission — and until that feature landed,
    none were. The question is recorded when it is RAISED, so that is what the
    tracker must read."""
    import json

    from app.knowledge.store import LocalGraphStore

    path = tmp_path / "knowledge_relationships.jsonl"
    path.write_text("\n".join([
        json.dumps({"src_kind": "objective", "src": "msn_parent", "rel": "raised",
                    "dst_kind": "gap", "dst": "What is the CPM?", "mission_id": "msn_parent"}),
        json.dumps({"src_kind": "objective", "src": "msn_parent", "rel": "raised",
                    "dst_kind": "gap", "dst": "Who else confirms it?", "mission_id": "msn_parent"}),
        json.dumps({"src_kind": "gap", "src": "Who else confirms it?", "rel": "answered by",
                    "dst_kind": "objective", "dst": "msn_child", "mission_id": "msn_parent"}),
        # noise that must not be mistaken for a nested question
        json.dumps({"src_kind": "source", "src": "s1", "rel": "produced",
                    "dst_kind": "evidence", "dst": "e1", "mission_id": "msn_parent"}),
    ]), encoding="utf-8")

    found = LocalGraphStore(tmp_path).nested_questions(limit=10)

    assert len(found) == 2, f"a raised question must be listed whether or not it was dispatched: {found}"
    # Newest first.
    assert found[0]["question"] == "Who else confirms it?"
    assert found[0]["answered_by"] == "msn_child", "a dispatched question must link to its own answer"
    assert found[1]["answered_by"] == "", "a folded question has no mission of its own, and must not invent one"
    assert all(q["raised_by"] == "msn_parent" for q in found)
