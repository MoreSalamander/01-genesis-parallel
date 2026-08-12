"""Market Intelligence cognitive roles (locked §2)."""
from app.agents.base import AgentRole

SPECIALISTS = [
    AgentRole("Audience Agent", "market", "audience behavior, demand signals, viewing trends"),
    AgentRole("Distribution Agent", "market", "distribution deals, platforms, windows, streamers"),
    AgentRole("Market Trend Agent", "market", "market movement, funding, box office, category trends"),
]
