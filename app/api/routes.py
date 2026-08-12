"""HTTP interface for the Studio Head console (frontend/) and for the eventual
Genesis OS External Intelligence Contract adapter. The standalone system owns
this API; the federation consumes it — never the reverse (Handoff §2, §16).
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.governance.authority import AuthorityError, record_decision
from app.models.evidence import Mission
from app.workflows.run_mission import dispatch_mission, get_runtime, run_mission, start_mission

router = APIRouter(prefix="/api")


class MissionRequest(BaseModel):
    objective: str = Field(min_length=8, max_length=500)


class DecisionRequest(BaseModel):
    decision: str  # approved | rejected | more_research


def _summary(mission: Mission) -> dict:
    return {
        "id": mission.id,
        "objective": mission.objective,
        "status": mission.status.value,
        "sources": len(mission.sources),
        "claims": len(mission.claims),
        "verified": len(mission.verified_claims),
        "conflicted": len(mission.conflicted_claims),
        "has_recommendation": mission.recommendation is not None,
        "created_at": mission.created_at,
        "updated_at": mission.updated_at,
    }


@router.get("/status")
def status() -> dict:
    runtime = get_runtime()
    return {
        "system": "Genesis OS — Signal Intelligence",
        "banner": runtime.settings.banner(),
        "parallel_live": runtime.settings.parallel_live,
        "gemini_live": runtime.settings.gemini_live,
        "missions": len(runtime.working.all()),
        "episodic": len(runtime.episodic.list()),
    }


@router.post("/missions", status_code=202)
def create_mission(body: MissionRequest, background: BackgroundTasks) -> dict:
    mission = start_mission(body.objective)
    execution = dispatch_mission(mission.id)
    if execution == "local":
        background.add_task(run_mission, mission.id)
    return {"id": mission.id, "status": mission.status.value, "execution": execution}


@router.get("/missions")
def list_missions() -> list[dict]:
    return [_summary(m) for m in get_runtime().working.all()]


@router.get("/missions/{mission_id}")
def get_mission(mission_id: str) -> dict:
    mission = get_runtime().working.get(mission_id)
    if mission is None:
        raise HTTPException(404, "mission not found")
    return mission.model_dump(mode="json")


@router.post("/missions/{mission_id}/decision")
def decide(mission_id: str, body: DecisionRequest) -> dict:
    runtime = get_runtime()
    mission = runtime.working.get(mission_id)
    if mission is None:
        raise HTTPException(404, "mission not found")
    try:
        record_decision(mission, body.decision, runtime.bus)
    except AuthorityError as err:
        raise HTTPException(400, str(err)) from err
    runtime.working.put(mission)  # durable checkpoint
    return _summary(mission)


@router.get("/knowledge/entities")
def knowledge_entities() -> dict:
    return get_runtime().knowledge.entities()


@router.get("/knowledge/relationships")
def knowledge_relationships(limit: int = 200) -> list[dict]:
    return get_runtime().knowledge.relationships(limit)


@router.get("/events")
def events(limit: int = 100) -> list[dict]:
    return get_runtime().bus.tail(limit)


@router.get("/memory/episodic")
def episodic(limit: int = 50) -> list[dict]:
    return get_runtime().episodic.list(limit)
