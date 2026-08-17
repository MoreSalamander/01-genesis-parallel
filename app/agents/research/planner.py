"""Research Planner (locked §7): dynamically constructs the research plan for an
objective — no hardcoded queries. The Executive delegates here; specialists are
cognitive roles instantiated per task (§2).
"""
from __future__ import annotations

from app.agents.industry.roles import SPECIALISTS as INDUSTRY
from app.agents.market.roles import SPECIALISTS as MARKET
from app.agents.strategic.roles import SPECIALISTS as STRATEGIC
from app.agents.talent.roles import SPECIALISTS as TALENT
from app.models.evidence import Domain, ResearchTask
from app.tools.google.gemini import Cognition

_ROSTERS = {
    Domain.MARKET: MARKET,
    Domain.TALENT: TALENT,
    Domain.INDUSTRY: INDUSTRY,
    Domain.STRATEGIC: STRATEGIC,
}


class ResearchPlanner:
    name = "Research Planner"
    permissions = ("read", "analyze")

    def __init__(self, cognition: Cognition):
        self.cognition = cognition

    def plan(self, objective: str, studio_context: str, max_tasks: int = 0) -> list[ResearchTask]:
        """`max_tasks` narrows the plan without narrowing the thinking.

        A follow-up raised by the loop is one specific question, not a fresh
        objective, and giving it the full eight-task treatment multiplies a
        metered retrieval bill for ground the parent has already covered. The
        planner still reasons about the whole question in one call — the plan is
        simply taken at the width the caller is willing to pay for.
        """
        raw = self.cognition.generate_json(
            "research_plan", {"objective": objective, "studio_context": studio_context}
        )
        tasks: list[ResearchTask] = []
        for item in raw.get("tasks", []):
            try:
                domain = Domain(item.get("domain", "").strip().lower())
            except ValueError:
                continue  # planner may not invent domains outside the locked four
            queries = [q for q in item.get("queries", []) if isinstance(q, str) and q.strip()][:3]
            if not queries:
                continue
            specialist = self._assign_specialist(domain, item.get("focus", ""))
            tasks.append(
                ResearchTask(domain=domain, focus=item.get("focus", objective), queries=queries, specialist=specialist)
            )
        return tasks[:max_tasks] if max_tasks > 0 else tasks

    @staticmethod
    def _assign_specialist(domain: Domain, focus: str) -> str:
        roster = _ROSTERS[domain]
        lowered = focus.lower()
        for role in roster:
            if any(word in lowered for word in role.focus.lower().split(",")[0].split()):
                return role.name
        return roster[0].name
