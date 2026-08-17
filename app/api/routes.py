"""HTTP interface for the Studio Head console (frontend/) and for the eventual
Genesis OS External Intelligence Contract adapter. The standalone system owns
this API; the federation consumes it — never the reverse (Handoff §2, §16).
"""
from __future__ import annotations

from collections import Counter

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
def list_missions(include_failed_raised: bool = False) -> list[dict]:
    """The questions asked, and answered.

    A question the system raised that retrieved nothing is left out by default.
    Thirteen of them appeared on the board when a quota failure killed each one
    mid-dispatch, and an empty INCOMPLETE row is not a question with an answer —
    the failure is recorded on the timeline of the answer that raised it, which is
    where it means something. The parent's own failures are never hidden, and
    `include_failed_raised=true` returns everything for auditing.
    """
    missions = get_runtime().working.all()
    if not include_failed_raised:
        missions = [m for m in missions if not (m.raised_by and not m.sources)]
    return [_summary(m) for m in missions]


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


@router.get("/vitals")
def vitals() -> dict:
    """How the research is holding up, in the shapes it actually has.

    Three percentages could not say the thing that matters most: *how much of
    this rests on one page*. A studio deciding on this needs the distribution,
    not the average — 500 confirmed claims reads well until you see that 700 more
    were said once and never corroborated.

    Every figure is counted from the missions themselves. A claim is attributed to
    a line of enquiry through the provenance on its evidence, so a claim assembled
    from two domains counts under both — which is why the domain totals do not sum
    to the claim total, and the console says so rather than hiding it.
    """
    from app.models.evidence import VerificationStatus

    runtime = get_runtime()
    missions = runtime.working.all()

    verified = conflicted = unverified = 0
    depth = {"1": 0, "2": 0, "3": 0, "4+": 0}
    by_domain: dict[str, dict[str, int]] = {}
    findings_total = findings_supported = 0
    confidence: list[float] = []

    for mission in missions:
        evidence_domain = {
            e.id: str(e.provenance.get("domain", "")) for e in mission.evidence
        }
        verified_ids = {
            c.id for c in mission.claims
            if c.status in (VerificationStatus.VERIFIED, VerificationStatus.CONFLICTED)
        }
        for claim in mission.claims:
            if claim.status == VerificationStatus.VERIFIED:
                verified += 1
            elif claim.status == VerificationStatus.CONFLICTED:
                conflicted += 1
            else:
                unverified += 1

            sources = max(1, claim.corroborating_sources)
            depth["4+" if sources >= 4 else str(sources)] += 1

            for evidence_id in claim.evidence_ids:
                domain = evidence_domain.get(evidence_id)
                if not domain:
                    continue
                bucket = by_domain.setdefault(domain, {"claims": 0, "held": 0})
                bucket["claims"] += 1
                if claim.status == VerificationStatus.VERIFIED:
                    bucket["held"] += 1
                break        # one claim, one attribution: its first recorded source

        findings_total += len(mission.findings)
        findings_supported += sum(
            1 for f in mission.findings if any(cid in verified_ids for cid in f.claim_ids)
        )
        if mission.recommendation:
            confidence.append(float(mission.recommendation.confidence))

    return {
        "claims": {"verified": verified, "conflicted": conflicted, "unverified": unverified},
        "depth": depth,
        "domains": [
            {"domain": name, "claims": v["claims"], "held": v["held"]}
            for name, v in sorted(by_domain.items())
        ],
        "findings": {"total": findings_total, "supported": findings_supported},
        "confidence": {
            "n": len(confidence),
            "mean": round(sum(confidence) / len(confidence), 3) if confidence else 0.0,
            "low": round(min(confidence), 3) if confidence else 0.0,
            "high": round(max(confidence), 3) if confidence else 0.0,
        },
    }


@router.get("/nested-questions")
def nested_questions(limit: int = 40) -> list[dict]:
    """The questions the system raised from its own answers, newest first.

    Read from the graph, not from missions carrying `raised_by`: a nested question
    is recorded the moment it is raised, whether or not it was also dispatched as
    a mission of its own. Looking only for dispatched ones is why the tracker read
    "none yet" while sixty-four sat in the store.
    """
    from app.models.evidence import MissionStatus

    working_states = {MissionStatus.PLANNED, MissionStatus.RESEARCHING,
                      MissionStatus.VERIFYING, MissionStatus.SYNTHESIZING}
    runtime = get_runtime()
    missions = {m.id: m for m in runtime.working.all()}
    out = []
    for item in runtime.knowledge.nested_questions(limit):
        child = missions.get(item["answered_by"])
        parent = missions.get(item["raised_by"])
        if child is not None and child.status in working_states:
            status = "working"          # in flight right now
        elif child is not None:
            status = "answered"         # dispatched, and finished
        else:
            status = "folded"           # researched into the answer that raised it
        out.append({
            **item,
            "raised_by_objective": parent.objective if parent else "",
            "status": status,
        })
    return out


@router.get("/fleet")
def fleet() -> dict:
    """What every agent and every line of enquiry has actually done, all-time.

    The mission page shows one question's crew; the board needs the standing
    tally, so this counts across every mission rather than the recent few. Work
    is counted from the events the agents emitted (`evidence.created` carries
    the specialist that produced it) and from the tasks the planner wrote —
    never estimated, so a sphere that reads 42 is 42 things that happened.
    """
    from app.agents import roster as roster_mod

    runtime = get_runtime()
    missions = runtime.working.all()
    # The whole log: a tally over a tail would quietly under-report every agent
    # that worked before the last few hundred events.
    events = runtime.bus.tail(1_000_000)

    produced: dict[str, int] = {}
    for event in events:
        if event.get("event") != "evidence.created":
            continue
        who = str(event.get("specialist") or "")
        if who:
            produced[who] = produced.get(who, 0) + int(event.get("count") or 0)

    found: dict[str, int] = {}
    for event in events:
        if event.get("event") != "signal.discovered":
            continue
        domain = str(event.get("domain") or "")
        if domain:
            found[domain] = found.get(domain, 0) + 1

    tasks_by_specialist: dict[str, int] = {}
    tasks_by_domain: dict[str, int] = {}
    for mission in missions:
        for task in mission.tasks:
            tasks_by_specialist[task.specialist] = tasks_by_specialist.get(task.specialist, 0) + 1
            tasks_by_domain[task.domain.value] = tasks_by_domain.get(task.domain.value, 0) + 1

    cast = roster_mod.roster()
    for domain in cast["domains"]:
        name = domain["domain"]
        domain["tasks"] = tasks_by_domain.get(name, 0)
        domain["sources"] = found.get(name, 0)
        for specialist in domain["specialists"]:
            specialist["tasks"] = tasks_by_specialist.get(specialist["name"], 0)
            specialist["produced"] = produced.get(specialist["name"], 0)

    # The deepen loop hires a researcher that is on no standing roster.
    follow_up = {"name": "follow-up researcher",
                 "tasks": sum(1 for m in missions for s in m.stages if s.name.startswith("ROUND ")),
                 "produced": produced.get("follow-up researcher", 0)}

    return {
        "standing": cast["standing"],
        "domains": cast["domains"],
        "follow_up": follow_up,
        "totals": {
            "missions": len(missions),
            "raised": sum(1 for m in missions if m.raised_by),
            "tasks": sum(tasks_by_domain.values()) + follow_up["tasks"],
            "produced": sum(produced.values()),
            "sources": sum(found.values()),
        },
    }


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


@router.get("/cognition/summary")
def cognition_summary() -> dict:
    """Gemini's own standing tally, for the board.

    Declared before /cognition/{cog_id} on purpose: FastAPI matches in
    declaration order, and the other way round "summary" is read as a call id.

    The ledger is a window, not an archive (cognition_ledger._MAX_RECORDS), so
    this reports what is still on record and says how many that is rather than
    implying it is everything the model has ever done.
    """
    from app import cognition_ledger

    rows = cognition_ledger.tail(limit=1_000_000)
    by_role: dict[str, dict] = {}
    for row in rows:
        entry = by_role.setdefault(row["role"], {"role": row["role"], "calls": 0, "ms": 0, "tokens": 0})
        entry["calls"] += 1
        entry["ms"] += int(row.get("ms") or 0)
        entry["tokens"] += int((row.get("tokens") or {}).get("total") or 0)

    # Name the model that actually ran, not whichever row happens to be newest:
    # one fixture call at the top had the board reporting the engine as
    # "fixture (no model called)" while 139 live calls sat underneath it.
    live_models = Counter(r["model"] for r in rows if r.get("live") and r.get("model"))
    any_models = Counter(r["model"] for r in rows if r.get("model"))
    ranked = live_models or any_models

    return {
        "model": ranked.most_common(1)[0][0] if ranked else "",
        "on_record": len(rows),
        "calls": len(rows),
        "tokens": sum(int((r.get("tokens") or {}).get("total") or 0) for r in rows),
        "ms": sum(int(r.get("ms") or 0) for r in rows),
        "live": sum(1 for r in rows if r.get("live")),
        "malformed": sum(1 for r in rows if not r.get("parsed_ok")),
        "by_role": sorted(by_role.values(), key=lambda r: r["calls"], reverse=True),
        # What it was doing most recently, so the object on the board has
        # something true to say rather than a generic idle state.
        "latest": rows[0] if rows else None,
    }


@router.get("/cognition/{cog_id}")
def cognition_detail(cog_id: str) -> dict:
    from app import cognition_ledger

    entry = cognition_ledger.get(cog_id)
    if entry is None:
        raise HTTPException(404, "no such model call")
    return entry
