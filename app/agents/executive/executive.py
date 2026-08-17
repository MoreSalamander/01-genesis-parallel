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
        missions=None,     # WorkingMemory — lets a raised question reach the board
    ):
        self.missions = missions
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
    # How wide one answer fans out. Every question here is a real retrieval call
    # against a metered API, so the width is a cost decision, not a taste one.
    HOLES_PER_ROUND = 3      # structural holes, rotated across kinds
    GAPS_PER_ROUND = 4       # those plus whatever the model raised

    def _deepen(self, mission: Mission) -> None:
        from app.knowledge import coverage

        if mission.raised_by:
            # This mission is itself a follow-up. It answers its question and
            # stops: without this the tree is unbounded, and every node of it
            # spends real retrieval calls.
            return

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
            cov = coverage.assess(mission, self.knowledge)
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
            #
            # Taken in order they arrive, a round fills with three unsupported
            # findings — three versions of one question. Rotating through the
            # kinds instead spends the round on an unsupported finding, a claim
            # only one page made, and a company nothing is confirmed about: one
            # answer fanning out into different directions, which is the whole
            # point of auditing against the graph.
            fresh: dict[str, list] = {}
            for hole in cov.holes:
                if hole.as_question() not in asked:
                    fresh.setdefault(hole.kind, []).append(hole)
            spread = []
            while len(spread) < self.HOLES_PER_ROUND and any(fresh.values()):
                for queue in fresh.values():
                    if queue and len(spread) < self.HOLES_PER_ROUND:
                        spread.append(queue.pop(0))
            gaps: list[dict] = [
                {"question": hole.as_question(), "why": hole.detail, "where": hole.where,
                 "kind": hole.kind}
                for hole in spread
            ]
            seen_questions = {g["question"] for g in gaps}
            for g in (verdict or {}).get("gaps") or []:
                question = g.get("question")
                if question and question not in seen_questions and question not in asked:
                    gaps.append(g)
                    seen_questions.add(question)
            gaps = gaps[:self.GAPS_PER_ROUND]

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
                        "No researchable nested question was identified, so nothing further was attempted.",
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
                    "The nested questions returned no further sources — the shortfall is stated "
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

    # A follow-up is a question, and a question belongs on the board with its own
    # answer — the way one you typed does. So each gap becomes a real mission:
    # its own page, its own agents, its own place in the graph, marked with what
    # raised it rather than passed off as asked.
    #
    # Two things keep that from becoming a runaway bill. A raised mission is
    # planned narrow (§: the planner still reasons once about the whole question,
    # the plan is taken at the width we pay for), and a raised mission never
    # deepens, so it cannot raise children of its own.
    CHILD_TASKS_FOCUSED = 2      # corroborate this, settle that — narrow by nature
    CHILD_TASKS_NEW_GROUND = 5   # nothing is known about this yet; two queries answers it badly
    # The kinds that can be new ground. The others are questions *about* something
    # already in hand, however little.
    _NEW_GROUND = {"unknown_entity", "like_thing"}

    def _width_for(self, gap: dict) -> int:
        """Let the context decide how wide a raised question runs.

        A fixed width is wrong in both directions. "Is this corroborated
        elsewhere?" is one question and a five-task plan spends four of them
        re-covering the parent's ground; "what is confirmed about this company
        nobody has looked at?" is a subject, and answering it with two queries
        produces exactly the thin answer that raised the question. So the graph
        is asked how much the studio already holds on the thing, and the plan is
        taken at that width.
        """
        if gap.get("kind") not in self._NEW_GROUND:
            return self.CHILD_TASKS_FOCUSED
        subject = (gap.get("where") or "").strip().lower()
        if not subject:
            return self.CHILD_TASKS_FOCUSED
        try:
            known = {name.lower(): record for name, record in self.knowledge.entities().items()}
        except Exception:
            return self.CHILD_TASKS_FOCUSED
        held = len((known.get(subject) or {}).get("assertions", []))
        return self.CHILD_TASKS_FOCUSED if held else self.CHILD_TASKS_NEW_GROUND

    def _raise_as_mission(self, parent: Mission, gap: dict, round_no: int) -> Mission | None:
        child = Mission(
            objective=gap["question"],
            raised_by=parent.id,
            raised_because=gap.get("why", "") or f"raised while answering {parent.objective[:80]}",
        )
        child.stage("RAISED", f"Raised by '{parent.objective[:80]}' — {child.raised_because[:120]}")
        try:
            width = self._width_for(gap)
            child.tasks = self.planner.plan(child.objective, STUDIO_CONTEXT, max_tasks=width)
            if not child.tasks:
                return None
            child.stage(
                "PLANNED",
                f"{len(child.tasks)} line{'' if len(child.tasks) == 1 else 's'} of enquiry — "
                + ("new ground for the studio, so this runs wide"
                   if width == self.CHILD_TASKS_NEW_GROUND else
                   "the studio already holds a record here, so this stays focused"),
            )
            self._research(child)
            if not child.sources:
                return None
            self._verify(child)
            self._build_knowledge(child)
            self._synthesize(child)
            self.complete(child)
        except Exception as err:
            # A follow-up that fails is recorded as failed. It must not take the
            # parent's answer down with it (§12).
            self._incomplete(child, f"Nested-question research failed: {err}")
        finally:
            if self.missions is not None:
                self.missions.put(child)
        self.bus.emit("intelligence.raised", mission_id=child.id, raised_by=parent.id,
                      round=round_no, objective=child.objective)
        return child

    def _research_gaps(self, mission: Mission, gaps: list[dict], round_no: int) -> None:
        """Run each gap as its own mission, then fold what it found into this one.

        The child carries the answer to its own question; the parent still has to
        absorb the evidence, because the shortfall being closed is the parent's.
        Folding rather than re-researching is also why one retrieval pass serves
        both places.
        """
        mission.status = MissionStatus.RESEARCHING
        seen_urls = {s.url: s for s in mission.sources}
        added = 0
        raised: list[str] = []

        for gap in gaps:
            question = gap["question"]
            child = self._raise_as_mission(mission, gap, round_no)
            if child is None:
                mission.stage("NESTED QUESTION FAILED", f"{question[:80]} — nothing came back")
                continue
            raised.append(child.id)
            self.knowledge.relate(
                "gap", question[:180], "answered by", "objective", child.id, mission.id
            )

            # Fold the child's evidence in, skipping anything already held.
            for source in child.sources:
                if source.url in seen_urls:
                    continue
                seen_urls[source.url] = source
                mission.sources.append(source)
                added += 1
            held = {s.url for s in mission.sources}
            by_id = {s.id: s for s in child.sources}
            for item in child.evidence:
                source = by_id.get(item.source_id)
                if source is None or source.url not in held:
                    continue
                mission.evidence.append(
                    item.model_copy(update={"provenance": dict(
                        item.provenance,
                        mission_id=mission.id,
                        round=round_no,
                        gap_question=question,
                        raised_mission_id=child.id,
                    )})
                )
            mission.observations.extend(child.observations)
            self.bus.emit("evidence.created", mission_id=mission.id, task_id=f"gap-{round_no}",
                          # This string is a data key, not a label: 61 recorded
                          # events already carry it and both the fleet tally and
                          # the mission page look it up by exact name. Renaming it
                          # to match the Studio Head's vocabulary would zero the
                          # historical tally, so the console maps it for display
                          # instead (frontend SPECIALIST_LABEL).
                          specialist="follow-up researcher", count=len(child.evidence))

        if raised:
            mission.stage(
                "QUESTIONS RAISED",
                f"{len(raised)} nested question{'' if len(raised) == 1 else 's'} asked as "
                f"missions of their own — each has its own answer on the board",
            )

        mission.stage(
            f"ROUND {round_no}",
            f"{added} new source{'' if added == 1 else 's'} from {len(gaps)} nested question"
            f"{'' if len(gaps) == 1 else 's'}",
        )
        return

    def _incomplete(self, mission: Mission, reason: str) -> None:
        mission.status = MissionStatus.INCOMPLETE
        mission.error = reason
        mission.stage("INCOMPLETE", reason)
        self.bus.emit("intelligence.incomplete", mission_id=mission.id, reason=reason)
