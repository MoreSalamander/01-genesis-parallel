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


@lru_cache(maxsize=1)
def get_runtime() -> Runtime:
    bus = EventBus(settings.data_dir)
    cognition = get_cognition(settings)
    parallel_tool = ParallelSearchTool(settings)
    knowledge = LocalGraphStore(settings.data_dir)
    datahub = DataHubEmitter(settings)
    episodic = EpisodicMemory(settings.data_dir)
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
    )
    return Runtime(
        settings=settings, bus=bus, working=WorkingMemory(),
        episodic=episodic, knowledge=knowledge, executive=executive,
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
