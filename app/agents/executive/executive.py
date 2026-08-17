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
        objects=None,      # MinIO raw-evidence store
        searcher=None,     # OpenSearch evidence index
        semantic=None,     # Qdrant semantic memory
        worldgraph=None,   # Neo4j world-model graph
    ):
        self.objects = objects
        self.searcher = searcher
        self.semantic = semantic
        self.worldgraph = worldgraph
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
            if not mission.sources:
                # Retrieval found nothing on this objective. Continuing would
                # synthesize a recommendation with no evidence under it, so the
                # mission stops here and says so (§12: never fabricate).
                self._incomplete(
                    mission,
                    "No external evidence was retrieved for this objective — "
                    "nothing was inferred in its absence.",
                )
                return mission
            self._verify(mission)
            self._build_knowledge(mission)
            self._synthesize(mission)
            self._deepen(mission)
            self.complete(mission)
        except ParallelUnavailable as err:
            self._incomplete(mission, f"External research unavailable: {err}")
        except Exception as err:  # agent failure → mark, never fabricate (§12)
            self._incomplete(mission, f"Agent failure: {err}")
        return mission

    def complete(self, mission: Mission) -> None:
        mission.status = MissionStatus.RECOMMENDED
        mission.stage("RECOMMENDED", mission.recommendation.action if mission.recommendation else "")
        self.episodic.record(mission)
        self.bus.emit("intelligence.completed", mission_id=mission.id, objective=mission.objective,
                      verified=len(mission.verified_claims), conflicted=len(mission.conflicted_claims))

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
                if self.objects is not None:  # immutable raw evidence (MinIO)
                    self.objects.put_source(mission.id, source.id, result.model_dump())
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
            extras = []
            if self.searcher is not None and self.searcher.available:
                extras.append(f"{self.searcher.index_mission(mission)} evidence indexed (OpenSearch)")
            if self.semantic is not None and self.semantic.available:
                extras.append(f"{self.semantic.upsert_claims(mission)} claims embedded (Qdrant)")
            if self.worldgraph is not None and self.worldgraph.available:
                extras.append(f"{self.worldgraph.mirror_mission(mission)} graph assertions (Neo4j)")
            if extras:
                detail += " · " + ", ".join(extras)
            mission.stage("KNOWLEDGE UPDATED", detail)
            self.bus.emit("knowledge.updated", mission_id=mission.id, entities=touched)

    def _synthesize(self, mission: Mission) -> None:
        mission.status = MissionStatus.SYNTHESIZING
        self.strategist.assess(mission)
        high = sum(1 for f in mission.findings if f.strategic_impact.value == "HIGH")
        mission.stage("ASSESSED", f"{len(mission.findings)} findings ({high} high-impact)")

    # Answering a question often reveals what you needed to know to answer it.
    # One pass stops the moment it has *a* response, which is how an objective
    # asking for ten named ideas came back with a recommendation to go and
    # select some — the answer named its own missing input (verified CPM and
    # competition figures) and then never went and got it.
    #
    # So: audit the answer against the objective, turn each shortfall into a
    # research question, research those, and re-synthesize with the new
    # evidence folded in.
    MAX_ROUNDS = 3

    def _deepen(self, mission: Mission) -> None:
        from app.knowledge import coverage

        # A hole that the last round failed to close is still a hole, so the
        # audit names it again and the loop asked the identical question twice:
        # one mission raised 8 follow-ups of which only 6 were distinct. Re-asking
        # spends a metered retrieval call to re-read the same corpus and reach the
        # same answer — the same reasoning the source-count check below already
        # applies, one level up. Rounds run inside a single `signal.deepen`
        # activity, so this set spans all of them (a Temporal retry of that
        # activity re-runs deepening from the top, and would re-ask).
        asked: set[str] = set()

        for round_no in range(2, self.MAX_ROUNDS + 1):
            # Two different questions, asked of two different things.
            #
            # The graph is walked, not consulted: a finding with no verified
            # claim beneath it is a missing edge, and it says exactly which
            # node is short. That is checkable, and it cannot flatter itself.
            #
            # The model is asked what the graph cannot know — whether the
            # answer meant what the objective asked. A graph cannot notice that
            # "top 10" wanted ten of something.
            #
            # Neither alone is enough, so the loop runs on both, and stops only
            # when the structure holds *and* the objective is met.
            cov = coverage.assess(mission)
            verdict = self._assess_sufficiency(mission)

            if verdict is None and cov.filled:
                mission.stage("COVERAGE OK", f"Audit unavailable, but the chain holds: {cov.summary()}")
                return
            if verdict is not None and verdict.get("fulfilled") and cov.filled:
                mission.stage(
                    "SUFFICIENT",
                    f"{verdict.get('reason', 'The answer addresses the objective.')} {cov.summary()}.",
                )
                return

            if cov.holes:
                mission.stage(
                    "THIN SUPPORT",
                    f"{len(cov.holes)} place{'' if len(cov.holes) == 1 else 's'} where the chain "
                    f"runs out — {cov.holes[0].detail}",
                )

            # Each round re-audits the *new* answer, so it should raise the next
            # question rather than the last one again. Two things stopped it.
            #
            # A structural hole regenerates identically for a node nothing has
            # changed, so slicing the holes before dropping the ones already
            # researched let three stale questions fill the round and truncate
            # away the new ones the fresh answer had just raised. Both sources
            # are filtered against what has been asked *before* anything is
            # sliced or capped, so the slots go to questions this round earned.
            already = [
                q for q in
                [hole.as_question() for hole in cov.holes]
                + [g.get("question") for g in ((verdict or {}).get("gaps") or []) if g.get("question")]
                if q in asked
            ]

            # Structural holes first: they name the node that is short, so the
            # follow-up question is about a specific weak point rather than the
            # objective at large.
            gaps: list[dict] = [
                {"question": hole.as_question(), "why": hole.detail, "where": hole.where}
                for hole in cov.holes if hole.as_question() not in asked
            ][:3]
            seen_questions = {g["question"] for g in gaps}
            for g in (verdict or {}).get("gaps") or []:
                question = g.get("question")
                if question and question not in seen_questions and question not in asked:
                    gaps.append(g)
                    seen_questions.add(question)
            gaps = gaps[:4]

            if not gaps:
                if already:
                    # Everything this round named had already been researched and
                    # did not close. That is the honest end of the chain: another
                    # round would ask the same corpus the same thing.
                    mission.stage(
                        "SAME SHORTFALL",
                        f"{len(already)} gap{'' if len(already) == 1 else 's'} named again after "
                        f"round {round_no - 1} researched {'it' if len(already) == 1 else 'them'} "
                        f"without closing {'it' if len(already) == 1 else 'them'} — "
                        f"stated rather than re-asked: {already[0][:110]}",
                    )
                else:
                    # Not fulfilled, but nothing actionable was named. Returning in
                    # silence here left no trace that the audit had happened at all,
                    # which made a working loop indistinguishable from one that never
                    # ran. Say what the audit found and stop.
                    mission.stage(
                        "SHORTFALL NOTED",
                        f"{(verdict or {}).get('reason', 'The answer falls short of the objective.')} "
                        "No researchable follow-up was identified, so nothing further was attempted.",
                    )
                return
            asked.update(g["question"] for g in gaps)

            mission.stage(
                "GAPS FOUND",
                f"{(verdict or {}).get('reason', 'The answer is incomplete.')} "
                f"Following up on {len(gaps)}: " + "; ".join(g["question"][:70] for g in gaps)
                + (f" ({len(already)} already researched, not re-asked)" if already else ""),
            )
            self.bus.emit(
                "intelligence.gap_found", mission_id=mission.id, round=round_no,
                reason=(verdict or {}).get("reason", ""),
                questions=[g["question"] for g in gaps],
            )
            # Provenance: the follow-up is part of this objective's tree, and
            # the context graph reads these to show why the search went where
            # it did rather than presenting one flat pass.
            for gap in gaps:
                self.knowledge.relate(
                    "objective", mission.id, "raised", "gap", gap["question"][:180], mission.id
                )

            before = len(mission.sources)
            self._research_gaps(mission, gaps, round_no)
            if len(mission.sources) == before:
                # Nothing new came back. Another round would ask the same
                # questions of the same corpus and reach the same answer.
                mission.stage(
                    "GAPS UNRESOLVED",
                    "Follow-up research returned no further sources — the shortfall is stated "
                    "rather than closed.",
                )
                return
            self._verify(mission)
            self._build_knowledge(mission)
            self._synthesize(mission)

        mission.stage(
            "ROUND LIMIT",
            f"Stopped after {self.MAX_ROUNDS} rounds. Anything still missing is named above "
            f"rather than filled in.",
        )

    def _assess_sufficiency(self, mission: Mission) -> dict | None:
        payload = {
            "objective": mission.objective,
            "recommendation": mission.recommendation.action if mission.recommendation else "",
            "findings": [f.text for f in mission.findings],
            "verified_claims": [c.text for c in mission.verified_claims],
            "conflicted_claims": [c.text for c in mission.conflicted_claims],
        }
        try:
            return self.cognition.generate_json("sufficiency_check", payload)
        except Exception as err:
            # A failed audit must not fail the mission, and must not be read as
            # "the answer was fine" — it is recorded as not having happened.
            mission.stage("AUDIT UNAVAILABLE", f"Could not check the answer against the objective: {err}")
            return None

    def _research_gaps(self, mission: Mission, gaps: list[dict], round_no: int) -> None:
        """Research the gap questions and fold the results into the mission.

        This mirrors _research rather than merely collecting URLs: a source with
        no evidence extracted from it produces no claims, so verification would
        have nothing new to check and the extra round would change nothing.
        """
        mission.status = MissionStatus.RESEARCHING
        seen_urls = {s.url: s for s in mission.sources}
        added = 0

        for gap in gaps:
            question = gap["question"]
            try:
                results = self.parallel.search(
                    objective=question, queries=[question], session_id=mission.id
                )
            except Exception as err:
                mission.stage("FOLLOW-UP FAILED", f"{question[:80]} — {err}")
                continue

            new_results = []
            for result in results:
                if result.url in seen_urls:
                    continue
                source = Source(url=result.url, title=result.title)
                seen_urls[result.url] = source
                mission.sources.append(source)
                self.bus.emit("signal.discovered", mission_id=mission.id, source_id=source.id,
                              title=source.title, url=source.url, domain="follow-up")
                if self.objects is not None:
                    self.objects.put_source(mission.id, source.id, result.model_dump())
                new_results.append(result)
                added += 1
            if not new_results:
                continue

            extraction = self.cognition.generate_json(
                "evidence_extraction",
                {"objective": question,
                 "results": [{"url": r.url, "title": r.title, "excerpts": r.excerpts}
                             for r in new_results]},
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
                            "round": round_no,
                            "gap_question": question,
                            "specialist": "follow-up researcher",
                            "domain": "follow-up",
                            "queries": [question],
                            "tool": "parallel-search" if self.parallel.live else "parallel-search(mock)",
                        },
                    )
                )
                created += 1
            self.bus.emit("evidence.created", mission_id=mission.id, task_id=f"gap-{round_no}",
                          specialist="follow-up researcher", count=created)

        mission.stage(
            f"ROUND {round_no}",
            f"{added} new source{'' if added == 1 else 's'} from {len(gaps)} follow-up question"
            f"{'' if len(gaps) == 1 else 's'}",
        )

    def _incomplete(self, mission: Mission, reason: str) -> None:
        mission.status = MissionStatus.INCOMPLETE
        mission.error = reason
        mission.stage("INCOMPLETE", reason)
        self.bus.emit("intelligence.incomplete", mission_id=mission.id, reason=reason)
