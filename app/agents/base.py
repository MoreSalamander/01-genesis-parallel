"""Agent base. Locked §2: agents are cognitive roles, not necessarily permanent
processes — the runtime instantiates only the roles an objective requires.
Locked §13: every agent carries a scoped permission set (separation of duties).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentRole:
    name: str
    domain: str
    focus: str
    permissions: tuple[str, ...] = ("read", "analyze")


@dataclass
class Agent:
    name: str
    permissions: tuple[str, ...] = ("read", "analyze")
    emitted: list[str] = field(default_factory=list)

    def can(self, permission: str) -> bool:
        return permission in self.permissions
