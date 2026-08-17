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
from app import runtime_proof

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
        # A question the loop raised is on the board like any other, but the
        # board must be able to say it was raised rather than asked.
        "raised_by": mission.raised_by,
        "raised_because": mission.raised_because,
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
        "runtime_proof": _runtime_proof(runtime.settings),
    }


def _runtime_proof(settings) -> dict:
    """Substrate states for the console's runtime-proof footer.

    These are configuration-derived starting points; app.runtime_proof
    overrides any of them the moment the substrate is actually exercised, so a
    chip only reads LIVE on evidence.
    """
    return runtime_proof.snapshot({
        "gemini": (("LIVE", f"credential present — narration via {settings.gemini_model}")
                   if settings.gemini_live
                   else ("MOCK", "no GOOGLE_API_KEY — deterministic mock narration")),
        "parallel": (("LIVE", "PARALLEL_API_KEY present — live web retrieval")
                     if settings.parallel_live
                     else ("MOCK", "no PARALLEL_API_KEY — fixture sources")),
        # An unset address means Temporal is not part of this deployment, not
        # that it broke — dialling it would report DEGRADED and read as a fault.
        "temporal": (("IDLE", f"configured at {settings.temporal_address} — "
                              "no workflow dispatched yet this session")
                     if settings.temporal_address
                     else ("MOCK", "no TEMPORAL_ADDRESS — in-process execution for this deployment")),
        "datahub": ("IDLE", f"configured at {settings.datahub_gms_url} — nothing promoted yet"),
    })


@router.post("/missions", status_code=202)
def create_mission(body: MissionRequest, background: BackgroundTasks) -> dict:
    from app.memory.ephemeral import MISSION_RATE_KEY, MISSION_RATE_LIMIT, MISSION_RATE_WINDOW_S

    runtime = get_runtime()
    if not runtime.ephemeral.allow_rate(MISSION_RATE_KEY, MISSION_RATE_LIMIT, MISSION_RATE_WINDOW_S):
        raise HTTPException(
            429, f"mission launch rate limit reached ({MISSION_RATE_LIMIT}/{MISSION_RATE_WINDOW_S}s) — "
                 "protecting Parallel/Gemini quotas"
        )
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


@router.get("/evidence/search")
def evidence_search(q: str, limit: int = 10) -> list[dict]:
    """Full-text institutional recall across all missions (OpenSearch)."""
    return get_runtime().executive.searcher.search(q, limit)


@router.get("/evidence/similar")
def evidence_similar(q: str, limit: int = 5) -> list[dict]:
    """Semantic recall — 'have we seen a signal like this before?' (Qdrant + Gemini embeddings)."""
    return get_runtime().executive.semantic.similar(q, limit)


@router.get("/knowledge/graph")
def knowledge_graph(entity: str = "", limit: int = 25) -> list[dict]:
    """World-model traversal (Neo4j): entity neighborhood, or top entities when unspecified."""
    graph = get_runtime().executive.worldgraph
    return graph.neighborhood(entity, limit) if entity else graph.entities(limit)


@router.get("/knowledge/relationships")
def knowledge_relationships(limit: int = 200) -> list[dict]:
    return get_runtime().knowledge.relationships(limit)


@router.get("/agents")
def agents() -> dict:
    """The cast: standing roles, and the specialists an objective can call up.

    Read from the role modules (app/agents/roster.py), so the console shows the
    agents this build actually has rather than a list maintained beside them.
    """
    from app.agents import roster

    return roster.roster()


@router.get("/events")
def events(limit: int = 100, mission: str = "") -> list[dict]:
    """Recent activity, or one mission's own activity when `mission` is given."""
    return get_runtime().bus.tail(limit, mission_id=mission)


@router.get("/memory/episodic")
def episodic(limit: int = 50) -> list[dict]:
    return get_runtime().episodic.list(limit)


# --- the reasoning itself -------------------------------------------------
# What the model was asked and what it said, recorded at the moment of the call
# (app/cognition_ledger.py). Summaries for the list, full text per call.

@router.get("/cognition")
def cognition(limit: int = 40, ref: str = "") -> list[dict]:
    from app import cognition_ledger

    return cognition_ledger.tail(limit=limit, ref=ref or None)


@router.get("/cognition/{cog_id}")
def cognition_detail(cog_id: str) -> dict:
    from app import cognition_ledger

    entry = cognition_ledger.get(cog_id)
    if entry is None:
        raise HTTPException(404, "no such model call")
    return entry
