"""Signal Intelligence Executive (locked §1): owns the intelligence objective —
interprets it, decomposes it, manages the research lifecycle, and presents the
recommendation. It delegates; it does not perform individual searches.

Failure handling per §12: tool failure → retries happen inside the tool; if the
tool is still unavailable the mission is marked INCOMPLETE with the reason.
Missing information is never fabricated.
"""
from __future__ import annotations

from app.agents.research.planner import ResearchPlanner
from app.agents.strategic.strategist import StrategicCognition
from app.agents.verification.verifier import VerificationAgent
from app.cognition.context import STUDIO_CONTEXT
from app.events.bus import EventBus
from app.knowledge.datahub.emitter import DataHubEmitter
from app.knowledge.store import LocalGraphStore
from app.memory.stores import EpisodicMemory
from app.models.evidence import Evidence, Mission, MissionStatus, Observation, Source
from app.tools.google.gemini import Cognition
from app.tools.parallel.client import ParallelSearchTool, ParallelUnavailable


class SignalIntelligenceExecutive:
    name = "Signal Intelligence Executive"
    permissions = ("read", "analyze", "recommend")

    def __init__(
        self,
        cognition: Cognition,
        parallel_tool: ParallelSearchTool,
        planner: ResearchPlanner,
        verifier: VerificationAgent,
        strategist: StrategicCognition,
        knowledge: LocalGraphStore,
        datahub: DataHubEmitter,
        episodic: EpisodicMemory,
        bus: EventBus,
    ):
        self.cognition = cognition
        self.parallel = parallel_tool
        self.planner = planner
        self.verifier = verifier
        self.strategist = strategist
        self.knowledge = knowledge
        self.datahub = datahub
        self.episodic = episodic
        self.bus = bus

    def run(self, mission: Mission) -> Mission:
        try:
            self._plan(mission)
            self._research(mission)
            self._verify(mission)
            self._build_knowledge(mission)
            self._synthesize(mission)
            mission.status = MissionStatus.RECOMMENDED
            mission.stage("RECOMMENDED", mission.recommendation.action if mission.recommendation else "")
            self.episodic.record(mission)
            self.bus.emit("intelligence.completed", mission_id=mission.id, objective=mission.objective,
                          verified=len(mission.verified_claims), conflicted=len(mission.conflicted_claims))
        except ParallelUnavailable as err:
            self._incomplete(mission, f"External research unavailable: {err}")
        except Exception as err:  # agent failure → mark, never fabricate (§12)
            self._incomplete(mission, f"Agent failure: {err}")
        return mission

    # -- stages ---------------------------------------------------------------
    def _plan(self, mission: Mission) -> None:
        mission.stage("MISSION ACCEPTED", mission.objective)
        mission.tasks = self.planner.plan(mission.objective, STUDIO_CONTEXT)
        if not mission.tasks:
            raise RuntimeError("Research planning produced no tasks")
        domains = ", ".join(sorted({t.domain.value for t in mission.tasks}))
        mission.stage("PLANNED", f"{len(mission.tasks)} research tasks across: {domains}")

    def _research(self, mission: Mission) -> None:
        mission.status = MissionStatus.RESEARCHING
        seen_urls: dict[str, Source] = {}
        for task in mission.tasks:
            results = self.parallel.search(objective=task.focus, queries=task.queries, session_id=mission.id)
            new_results = []
            for result in results:
                if result.url in seen_urls:
                    continue  # already extracted in an earlier task this mission
                source = Source(url=result.url, title=result.title)
                seen_urls[result.url] = source
                mission.sources.append(source)
                self.bus.emit("signal.discovered", mission_id=mission.id, source_id=source.id,
                              title=source.title, url=source.url, domain=task.domain.value)
                new_results.append(result)
            if not new_results:
                continue

            extraction = self.cognition.generate_json(
                "evidence_extraction",
                {"objective": task.focus,
                 "results": [{"url": r.url, "title": r.title, "excerpts": r.excerpts} for r in new_results]},
            )
            created = 0
            for item in extraction.get("claims", []):
                source = seen_urls.get(item.get("source_url", ""))
                if source is None:
                    continue
                observation = Observation(source_id=source.id, statement=item.get("statement", ""))
                mission.observations.append(observation)
                mission.evidence.append(
                    Evidence(
                        observation_id=observation.id,
                        source_id=source.id,
                        claim_text=item.get("claim", item.get("statement", "")),
                        supporting_content=item.get("statement", ""),
                        confidence=float(item.get("confidence", 0.5)),
                        related_entities=[item["entity"]] if item.get("entity") else [],
                        provenance={
                            "mission_id": mission.id,
                            "task_id": task.id,
                            "specialist": task.specialist,
                            "domain": task.domain.value,
                            "queries": task.queries,
                            "tool": "parallel-search" if self.parallel.live else "parallel-search(mock)",
                        },
                    )
                )
                created += 1
            self.bus.emit("evidence.created", mission_id=mission.id, task_id=task.id,
                          specialist=task.specialist, count=created)
        mission.stage("RESEARCHED", f"{len(mission.sources)} sources, {len(mission.evidence)} evidence items")

    def _verify(self, mission: Mission) -> None:
        mission.status = MissionStatus.VERIFYING
        self.verifier.verify(mission)
        unverified = len(mission.claims) - len(mission.verified_claims) - len(mission.conflicted_claims)
        mission.stage(
            "VERIFIED",
            f"{len(mission.verified_claims)} verified, {len(mission.conflicted_claims)} conflicted, "
            f"{unverified} unverified claim groups",
        )

    def _build_knowledge(self, mission: Mission) -> None:
        touched = self.knowledge.ingest_mission(mission)
        if touched:
            mirrored = 0
            entities = self.knowledge.entities()
            for name in touched:
                if self.datahub.emit_entity(name, entities.get(name, {})):
                    mirrored += 1
            detail = f"{len(touched)} entities promoted"
            if self.datahub.available:
                detail += f" ({mirrored} mirrored to DataHub)"
            mission.stage("KNOWLEDGE UPDATED", detail)
            self.bus.emit("knowledge.updated", mission_id=mission.id, entities=touched)

    def _synthesize(self, mission: Mission) -> None:
        mission.status = MissionStatus.SYNTHESIZING
        self.strategist.assess(mission)
        high = sum(1 for f in mission.findings if f.strategic_impact.value == "HIGH")
        mission.stage("ASSESSED", f"{len(mission.findings)} findings ({high} high-impact)")

    def _incomplete(self, mission: Mission, reason: str) -> None:
        mission.status = MissionStatus.INCOMPLETE
        mission.error = reason
        mission.stage("INCOMPLETE", reason)
        self.bus.emit("intelligence.incomplete", mission_id=mission.id, reason=reason)
