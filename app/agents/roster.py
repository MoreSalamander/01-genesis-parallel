"""Who is in the room, and what each one is allowed to do.

The console could show what the *work* was doing — eight lines of enquiry, four
domains, sources arriving — but never who was doing it. The planner assigns a
named specialist to every task (`task.specialist`) and the API has always
carried it; nothing rendered it, so the most-locked part of the architecture,
nested cognition (§2) and separation of duties (§13), was invisible on screen.

This is the roster those two sections describe, read from the role modules
themselves rather than restated. §2 is the point worth seeing: the standing
roles are always in the room, while the thirteen specialists exist only when an
objective calls for them — so a roster that shows both, with the dormant ones
plainly dormant, is the architecture rather than a picture of it.
"""
from __future__ import annotations

from app.agents.base import AgentRole
from app.agents.industry.roles import SPECIALISTS as INDUSTRY
from app.agents.market.roles import SPECIALISTS as MARKET
from app.agents.strategic.roles import SPECIALISTS as STRATEGIC
from app.agents.talent.roles import SPECIALISTS as TALENT

# Permissions are read off the classes that hold them, so this cannot drift into
# claiming an authority the running agent does not have.
from app.agents.executive.executive import SignalIntelligenceExecutive
from app.agents.research.planner import ResearchPlanner
from app.agents.strategic.strategist import StrategicCognition
from app.agents.verification.verifier import VerificationAgent

DOMAINS = ("market", "talent", "industry", "strategic")

SPECIALISTS: tuple[AgentRole, ...] = tuple(MARKET + TALENT + INDUSTRY + STRATEGIC)

# Always present: they are the loop itself, not a response to an objective.
STANDING: tuple[dict, ...] = (
    {
        "name": "Executive Agent",
        "role": "owns the objective end to end — plans, delegates, and decides when the answer is finished",
        "permissions": SignalIntelligenceExecutive.permissions,
        "stage": "throughout",
    },
    {
        "name": "Research Planner",
        "role": "splits one question into the lines of enquiry, and picks which specialist takes each",
        "permissions": ResearchPlanner.permissions,
        "stage": "PLANNED",
    },
    {
        "name": "Verification Agent",
        "role": "checks every claim against the sources that produced it, and preserves disagreements rather than resolving them",
        "permissions": VerificationAgent.permissions,
        "stage": "VERIFIED",
    },
    {
        "name": "Strategic Cognition",
        "role": "weighs what held up into findings, then a recommendation for the Studio Head",
        "permissions": StrategicCognition.permissions,
        "stage": "ASSESSED",
    },
)


def roster() -> dict:
    """The full cast, grouped the way the architecture nests it."""
    return {
        "standing": [dict(agent, permissions=list(agent["permissions"])) for agent in STANDING],
        "domains": [
            {
                "domain": domain,
                "specialists": [
                    {"name": role.name, "focus": role.focus, "permissions": list(role.permissions)}
                    for role in SPECIALISTS
                    if role.domain == domain
                ],
            }
            for domain in DOMAINS
        ],
    }
