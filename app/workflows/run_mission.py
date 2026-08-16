"""Mission workflow wiring: assembles the agent organization once and runs
missions through it. (Durable-workflow substrate — Temporal — belongs to the
production architecture, not this standalone MVP; see Handoff §22/§25.)
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.agents.executive.executive import SignalIntelligenceExecutive
from app.agents.research.planner import ResearchPlanner
from app.agents.strategic.strategist import StrategicCognition
from app.agents.verification.verifier import VerificationAgent
from app.config import Settings, settings
from app import runtime_proof
from app.events.bus import EventBus
from app.knowledge.datahub.emitter import DataHubEmitter
from app.knowledge.store import LocalGraphStore
from app.memory.stores import EpisodicMemory, WorkingMemory
from app.models.evidence import Mission
from app.tools.google.gemini import get_cognition
from app.tools.parallel.client import ParallelSearchTool


@dataclass
class Runtime:
    settings: Settings
    bus: EventBus
    working: WorkingMemory
    episodic: EpisodicMemory
    knowledge: LocalGraphStore
    executive: SignalIntelligenceExecutive
    ephemeral: object = None


@lru_cache(maxsize=1)
def get_runtime() -> Runtime:
    from app.observability.tracing import setup_tracing

    setup_tracing(settings, "genesis-signal")
    bus = EventBus(
        settings.data_dir,
        nats_url="" if settings.force_mock else settings.nats_url,
        subject=settings.nats_subject,
    )
    cognition = get_cognition(settings)
    parallel_tool = ParallelSearchTool(settings)
    knowledge = LocalGraphStore(settings.data_dir)
    datahub = DataHubEmitter(settings)
    episodic = EpisodicMemory(settings.data_dir)
    from app.knowledge.graph import WorldGraph
    from app.knowledge.objects import EvidenceObjectStore
    from app.knowledge.search import EvidenceSearch
    from app.knowledge.semantic import SemanticMemory

    executive = SignalIntelligenceExecutive(
        cognition=cognition,
        parallel_tool=parallel_tool,
        planner=ResearchPlanner(cognition),
        verifier=VerificationAgent(cognition, bus),
        strategist=StrategicCognition(cognition, bus),
        knowledge=knowledge,
        datahub=datahub,
        episodic=episodic,
        bus=bus,
        objects=EvidenceObjectStore(settings),
        searcher=EvidenceSearch(settings),
        semantic=SemanticMemory(settings),
        worldgraph=WorldGraph(settings),
    )
    from app.memory.durable import get_store
    from app.memory.ephemeral import get_ephemeral

    return Runtime(
        settings=settings, bus=bus, working=WorkingMemory(get_store(settings)),
        episodic=episodic, knowledge=knowledge, executive=executive,
        ephemeral=get_ephemeral(settings),
    )


def start_mission(objective: str) -> Mission:
    runtime = get_runtime()
    mission = Mission(objective=objective)
    runtime.working.put(mission)
    return mission


def run_mission(mission_id: str) -> None:
    runtime = get_runtime()
    mission = runtime.working.get(mission_id)
    if mission is not None:
        runtime.executive.run(mission)
        runtime.working.put(mission)  # durable checkpoint


def dispatch_mission(mission_id: str) -> str:
    """Start the durable MissionWorkflow; 'local' on surfaced fallback."""
    if settings.force_mock:
        runtime_proof.record("temporal", "MOCK",
                             "GENESIS_MOCK set — in-process execution by design")
        return "local"
    if not settings.temporal_address:
        # Not part of this deployment (e.g. Cloud Run). Attempting a dial would
        # report DEGRADED, which reads as a fault rather than an absent
        # substrate — so say what is actually true and run in-process.
        runtime_proof.record("temporal", "MOCK",
                             "no TEMPORAL_ADDRESS — in-process execution for this deployment")
        return "local"
    try:
        import asyncio

        from temporalio.client import Client

        async def go():
            client = await Client.connect(settings.temporal_address)
            await client.start_workflow(
                "MissionWorkflow", mission_id,
                id=f"msn-wf-{mission_id}", task_queue=settings.temporal_task_queue,
            )

        asyncio.run(go())
        runtime_proof.record("temporal", "LIVE",
                             f"durable workflow accepted at {settings.temporal_address}")
        return "temporal"
    except Exception as err:
        print(f"[workflow] Temporal dispatch failed ({err}) — DEGRADED: in-process execution")
        runtime_proof.record("temporal", "DEGRADED",
                             f"dispatch failed ({err}) — ran in-process instead")
        return "local"
