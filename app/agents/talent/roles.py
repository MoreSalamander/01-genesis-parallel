"""Talent Intelligence cognitive roles (locked §2)."""
from app.agents.base import AgentRole

SPECIALISTS = [
    AgentRole("Creator Agent", "talent", "creators, directors, writers and their moves"),
    AgentRole("Talent Agent", "talent", "on-screen talent, representation, attachments"),
    AgentRole("Production Company Agent", "talent", "production companies, leadership, hires"),
]
