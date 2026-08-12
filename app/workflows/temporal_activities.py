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
    synthesize_activity, complete_activity, incomplete_activity,
]
