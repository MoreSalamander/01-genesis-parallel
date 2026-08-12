"""Parallel Search integration — the external discovery/research substrate (locked §7).

LIVE mode calls Parallel's Search API at runtime via the official `parallel-web`
SDK (hackathon Parallel-track requirement). MOCK mode serves a deterministic
fictional corpus so the full mission flow runs from a clean clone with no keys.

Locked failure rule (§12): if Parallel is unavailable, the mission is marked
incomplete — external information is never fabricated.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.config import Settings


class SearchResult(BaseModel):
    url: str
    title: str
    excerpts: list[str]


class ParallelUnavailable(RuntimeError):
    """Raised when live Parallel search cannot be completed (retries exhausted)."""


class ParallelSearchTool:
    """Dynamically-constructed searches against Parallel's Search API (no hardcoded queries)."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        if settings.parallel_live:
            from parallel import Parallel  # official parallel-web SDK

            self._client = Parallel(api_key=settings.parallel_api_key)

    @property
    def live(self) -> bool:
        return self._client is not None

    def search(
        self, objective: str, queries: list[str], max_results: int = 8, session_id: str | None = None
    ) -> list[SearchResult]:
        if self._client is None:
            return _mock_search(queries, max_results)
        return self._live_search(objective, queries, max_results, session_id)

    def _live_search(
        self, objective: str, queries: list[str], max_results: int, session_id: str | None
    ) -> list[SearchResult]:
        # parallel-web v1.2 surface: Parallel.search(search_queries=[...], objective=...,
        # mode=..., max_chars_total=..., session_id=...) -> SearchResult(results=[WebSearchResult])
        attempts = 0
        last_err: Exception | None = None
        while attempts < 3:
            attempts += 1
            try:
                resp = self._client.search(
                    objective=objective,
                    search_queries=queries[:3],
                    max_chars_total=6000,
                    session_id=session_id,
                )
                return [
                    SearchResult(
                        url=item.url,
                        title=item.title or item.url,
                        excerpts=list(item.excerpts or []),
                    )
                    for item in (resp.results or [])[:max_results]
                ]
            except Exception as err:  # retry with backoff, then surface (§12)
                last_err = err
                import time

                time.sleep(1.5 * attempts)
        raise ParallelUnavailable(f"Parallel Search failed after {attempts} attempts: {last_err}")


# --------------------------------------------------------------------------
# Mock corpus — entirely fictional entities (safe for demos and offline judges)
# --------------------------------------------------------------------------

_CORPUS: list[dict] = [
    {
        "url": "https://tradedaily.example.com/meridian-forge-series-a",
        "title": "Meridian Forge Studios closes $40M Series A to build AI-native production pipeline",
        "excerpts": [
            "Meridian Forge Studios has closed a $40M Series A round to expand its AI-native production pipeline.",
            "The studio plans to double output of mid-budget features within two years.",
        ],
        "topics": ["funding", "company", "market"],
    },
    {
        "url": "https://wire.example.com/meridian-forge-announcement",
        "title": "Meridian Forge announces $40M funding round led by Halcyon Ventures",
        "excerpts": [
            "Meridian Forge Studios today announced a $40M financing led by Halcyon Ventures.",
            "Proceeds fund virtual-production capacity and original IP development.",
        ],
        "topics": ["funding", "company"],
    },
    {
        "url": "https://screenrumors.example.com/meridian-funding-scoop",
        "title": "Sources: Meridian Forge raise closer to $25M than reported",
        "excerpts": [
            "Two people familiar with the deal say Meridian Forge Studios raised $25M, not the larger figure reported elsewhere.",
        ],
        "topics": ["funding", "company"],
    },
    {
        "url": "https://tradedaily.example.com/meridian-northlight-firstlook",
        "title": "Meridian Forge signs first-look deal with streamer Northlight",
        "excerpts": [
            "Meridian Forge Studios has signed a first-look deal with streaming service Northlight, according to the announcement.",
        ],
        "topics": ["distribution", "market", "company"],
    },
    {
        "url": "https://tradedaily.example.com/dana-reyes-meridian-cto",
        "title": "Meridian Forge hires ex-Pixomatic VFX head Dana Reyes as CTO",
        "excerpts": [
            "Dana Reyes, formerly head of VFX at Pixomatic, joins Meridian Forge Studios as Chief Technology Officer.",
        ],
        "topics": ["talent", "leadership", "company"],
    },
    {
        "url": "https://careers.example.com/dana-reyes-post",
        "title": "Dana Reyes: 'Thrilled to join Meridian Forge as CTO'",
        "excerpts": [
            "Dana Reyes confirmed joining Meridian Forge Studios as CTO to lead its real-time pipeline team.",
        ],
        "topics": ["talent", "leadership"],
    },
    {
        "url": "https://stagecraft.example.com/glasshouse-expansion",
        "title": "Glasshouse Collective opens second LED virtual-production stage",
        "excerpts": [
            "Glasshouse Collective has opened its second LED volume, doubling virtual-production capacity for indie features.",
        ],
        "topics": ["industry", "technology", "company"],
    },
    {
        "url": "https://techsheet.example.com/glasshouse-led-volume",
        "title": "Glasshouse Collective expands with new LED volume in Atlanta",
        "excerpts": [
            "The Glasshouse Collective expansion adds a second LED virtual-production stage, with capacity aimed at mid-budget features.",
        ],
        "topics": ["industry", "technology"],
    },
]


def _mock_search(queries: list[str], max_results: int) -> list[SearchResult]:
    terms = " ".join(queries).lower()
    scored: list[tuple[int, dict]] = []
    for doc in _CORPUS:
        score = sum(1 for topic in doc["topics"] if topic in terms)
        hay = (doc["title"] + " " + " ".join(doc["excerpts"])).lower()
        score += sum(1 for word in terms.split() if len(word) > 3 and word in hay)
        scored.append((score, doc))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    picked = [doc for score, doc in scored if score > 0][:max_results] or [doc for _, doc in scored[:max_results]]
    return [SearchResult(url=d["url"], title=d["title"], excerpts=d["excerpts"]) for d in picked]
