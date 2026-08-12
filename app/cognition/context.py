"""Scoped context (locked §3): higher cognition passes relevant context downward.
The standalone system carries the studio-level context; each mission builds its
objective-scoped context from it. Lower scopes do not inherit everything.
"""
from __future__ import annotations

STUDIO_CONTEXT = (
    "Convergence Studios is an AI-native entertainment studio producing film and episodic "
    "content. Strategic priorities: identify emerging production companies and talent early, "
    "track production technology shifts (virtual production, AI pipelines), and protect "
    "distribution options. The Studio Head is the final authority on all consequential actions."
)


def objective_context(objective: str) -> dict:
    return {
        "studio_context": STUDIO_CONTEXT,
        "objective": objective,
        "constraints": [
            "Only evidence retrieved from external research may ground claims.",
            "Conflicting evidence is preserved, never silently resolved.",
            "No external actions without Studio Head authorization.",
        ],
    }
