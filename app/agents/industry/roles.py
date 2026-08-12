"""Industry Intelligence cognitive roles (locked §2)."""
from app.agents.base import AgentRole

SPECIALISTS = [
    AgentRole("Competitor Agent", "industry", "competitor studios and their strategic moves"),
    AgentRole("Technology Agent", "industry", "production technology, virtual production, pipelines"),
    AgentRole("Industry Development Agent", "industry", "industry structure, regulation, business models"),
]
