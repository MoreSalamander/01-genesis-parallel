# Genesis OS — Signal Intelligence

**External Intelligence for an AI-native film studio.** Watch a studio's intelligence bureau research the outside world: agents plan a mission, retrieve real evidence through **Parallel's Search API**, verify claims (preserving disagreements instead of hand-waving them), build a provenance-linked knowledge graph, and put an evidence-backed recommendation in front of the human **Studio Head** — who remains the final authority.

> **Genesis OS Suite** — this is System 01 of Genesis OS, an operating environment for the fictional
> **Convergence Studios**. Each system is a fully standalone submission:
> **[01 Signal Intelligence (Parallel)]** · 02 Operational Intelligence (Grafana) · 03 Institutional
> Intelligence (ClickHouse) · 04 Enterprise Decision Intelligence (IBM + Bob) · 05 Autonomous Studio
> Construction (Replit) — federated later by Genesis OS, never dependent on it.

*Google Cloud Agentic Cinema Hackathon — Parallel track.*

## Architecture

```
STUDIO HEAD ("What is happening outside the studio that should change what we do?")
     │
     ▼
SIGNAL INTELLIGENCE EXECUTIVE ── owns the objective, not the searches
     │
RESEARCH PLANNER ── Gemini dynamically decomposes the objective
     │
┌────┴─────┬──────────┬───────────┐
MARKET   TALENT   INDUSTRY   STRATEGIC     ← four locked cognitive domains
└────┬─────┴──────────┴───────────┘
     ▼
PARALLEL SEARCH API ── external observation (runtime integration)
     ▼
EVIDENCE ──► VERIFICATION ──► VERIFIED / UNVERIFIED / CONFLICTED (conflicts preserved)
     ▼
KNOWLEDGE GRAPH (provenance: Source→Evidence→Claim→Entity; DataHub mirror optional)
     ▼
STRATEGIC COGNITION ──► RECOMMENDATION (confidence + evidence trail)
     ▼
STUDIO HEAD ── approve / reject / request more research   ← human authority boundary
```

Full locked architecture: [docs/architecture/system-01-parallel.v2.locked.md](docs/architecture/system-01-parallel.v2.locked.md)

## Runtime integrations (the ones that matter)

| Requirement | Where it lives |
|---|---|
| **Parallel Search API at runtime** (official `parallel-web` SDK) | [`app/tools/parallel/client.py`](app/tools/parallel/client.py) |
| **Gemini at runtime** (official `google-genai` SDK) | [`app/tools/google/gemini.py`](app/tools/google/gemini.py) |
| Evidence lineage + verification states | [`app/models/evidence.py`](app/models/evidence.py), [`app/agents/verification/verifier.py`](app/agents/verification/verifier.py) |
| Human authority boundary | [`app/governance/authority.py`](app/governance/authority.py) |

## Quickstart

```bash
# 1. Install (Python 3.11+)
uv venv .venv && uv pip install -p .venv -e ".[dev]"

# 2. Run — with no keys this boots in MOCK mode (deterministic fictional corpus,
#    full mission flow demonstrable offline)
.venv/bin/uvicorn app.main:app --reload
# open http://localhost:8000  (API docs at /docs)

# 3. Go LIVE: copy .env.example to .env and set
#    PARALLEL_API_KEY=...     → real Parallel Search API research
#    GOOGLE_API_KEY=...       → real Gemini cognition (or Vertex AI env vars)
```

Run a mission:

```bash
curl -s -X POST localhost:8000/api/missions \
  -H 'content-type: application/json' \
  -d '{"objective": "Find emerging production companies worth monitoring"}'
# then poll:
curl -s localhost:8000/api/missions | python3 -m json.tool
```

Studio Head console (Next.js) lives in [`frontend/`](frontend/).

## Tests

```bash
.venv/bin/pytest -q
```

Covers the evidence lineage model, the three verification states (corroborated → VERIFIED, credible disagreement → CONFLICTED and preserved, single-source → UNVERIFIED), and the full mission flow end-to-end in mock mode including the Studio Head authorization boundary.

## License

MIT — see [LICENSE](LICENSE).
