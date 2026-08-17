"""Temporal activities — each locked mission stage as a durable, retryable unit.
Each activity loads the mission from PostgreSQL, runs one stage, and checkpoints
the document back, so a crashed worker resumes from the last completed stage.
"""
from __future__ import annotations

from temporalio import activity

from app.models.evidence import Mission


def _runtime():
    from app.workflows.run_mission import get_runtime

    return get_runtime()


def _load(mission_id: str) -> Mission:
    # Tag model calls with the run that caused them. Every activity loads the
    # mission first, so this covers the whole Temporal path — the one that
    # actually runs, and the one that bypasses run_mission() entirely.
    from app import cognition_ledger

    cognition_ledger.set_ref(mission_id)
    mission = _runtime().working.get(mission_id)
    if mission is None:
        raise RuntimeError(f"mission {mission_id} not found in durable state")
    return mission


def _save(mission: Mission) -> None:
    _runtime().working.put(mission)


def _stage(mission_id: str, method: str) -> str:
    rt = _runtime()
    mission = _load(mission_id)
    getattr(rt.executive, method)(mission)
    _save(mission)
    return mission.status.value


@activity.defn(name="signal.plan")
def plan_activity(mission_id: str) -> str:
    return _stage(mission_id, "_plan")


@activity.defn(name="signal.research")
def research_activity(mission_id: str) -> str:
    return _stage(mission_id, "_research")


@activity.defn(name="signal.verify")
def verify_activity(mission_id: str) -> str:
    return _stage(mission_id, "_verify")


@activity.defn(name="signal.knowledge")
def knowledge_activity(mission_id: str) -> str:
    return _stage(mission_id, "_build_knowledge")


@activity.defn(name="signal.synthesize")
def synthesize_activity(mission_id: str) -> str:
    return _stage(mission_id, "_synthesize")


@activity.defn(name="signal.deepen")
def deepen_activity(mission_id: str) -> str:
    """Audit the answer against the objective and, if it falls short, research
    the shortfall and re-synthesize. Its own durable step because it can run
    several rounds of retrieval and must be retried and checkpointed like any
    other stage — and because the executive's run() convenience path is not
    what executes in production."""
    return _stage(mission_id, "_deepen")


@activity.defn(name="signal.complete")
def complete_activity(mission_id: str) -> str:
    return _stage(mission_id, "complete")


@activity.defn(name="signal.incomplete")
def incomplete_activity(mission_id: str, reason: str) -> str:
    rt = _runtime()
    mission = _load(mission_id)
    rt.executive._incomplete(mission, reason)
    _save(mission)
    return mission.status.value


ALL_ACTIVITIES = [
    plan_activity, research_activity, verify_activity, knowledge_activity,
    synthesize_activity, deepen_activity, complete_activity, incomplete_activity,
]
