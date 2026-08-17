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
