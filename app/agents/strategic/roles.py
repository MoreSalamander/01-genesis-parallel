"""Strategic Intelligence cognitive roles (locked §2)."""
from app.agents.base import AgentRole

SPECIALISTS = [
    AgentRole("Opportunity Agent", "strategic", "opportunities the studio could act on"),
    AgentRole("Threat Agent", "strategic", "competitive and structural threats"),
    AgentRole("Strategic Fit Agent", "strategic", "fit with studio strategy and capabilities"),
    AgentRole("Blind Spot Agent", "strategic", "what the studio is not watching but should be"),
]
