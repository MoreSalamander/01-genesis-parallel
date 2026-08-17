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
     │
     ├──► COVERAGE AUDIT ── the answer is read back against the context graph:
     │         which findings rest on nothing verified, which claims one page
     │         asserted, which companies nothing is confirmed about
     │              │
     │              ▼
     │      NESTED QUESTIONS ── each shortfall becomes a question of its own,
     │         researched, answered, and put on the board like one you typed.
     │         Bounded: four per answer, and a raised question never raises more.
     │              └──────────────► back into EVIDENCE, and the answer improves
     ▼
STUDIO HEAD ── approve / reject / request more research   ← human authority boundary
```

**Nested questions are the part worth looking at.** One pass stops as soon as it
has *a* response — asked for "the top 10 faceless YouTube ideas", the system once
answered with a recommendation to go and *find* ten ideas, citing CPM data it did
not have. So the answer is now audited against the provenance graph, which cannot
flatter itself: a finding with no verified claim beneath it is a missing edge, not
a matter of opinion. Each shortfall becomes its own researched question, and the
loop stops when the structure holds and the objective is met.

Full locked architecture: [docs/architecture/system-01-parallel.v2.locked.md](docs/architecture/system-01-parallel.v2.locked.md)

## Runtime integrations (the ones that matter)

| Requirement | Where it lives |
|---|---|
| **Parallel Search API at runtime** (official `parallel-web` SDK) | [`app/tools/parallel/client.py`](app/tools/parallel/client.py) |
| **Gemini at runtime** (official `google-genai` SDK) | [`app/tools/google/gemini.py`](app/tools/google/gemini.py) |
| Evidence lineage + verification states | [`app/models/evidence.py`](app/models/evidence.py), [`app/agents/verification/verifier.py`](app/agents/verification/verifier.py) |
| Human authority boundary | [`app/governance/authority.py`](app/governance/authority.py) |
| Nested questions: the coverage audit, and dispatching each shortfall as its own mission | [`app/knowledge/coverage.py`](app/knowledge/coverage.py), [`app/agents/executive/executive.py`](app/agents/executive/executive.py) |
| Every model call recorded with its exact prompt and response | [`app/cognition_ledger.py`](app/cognition_ledger.py) |
| Runtime proof: LIVE only on first-hand evidence a substrate was used | [`app/runtime_proof.py`](app/runtime_proof.py) |

## Quickstart

**Use Python 3.12.** Not 3.13+, and not whatever `python3` happens to be — pydantic-core
publishes no wheels for 3.14, so a default `python3` on a current macOS fails at install
with a Rust build error. `pyproject.toml` pins the ceiling, but pick the interpreter
yourself and save the confusion:

```bash
# 1. Install
uv venv .venv --python 3.12 && uv pip install -p .venv -e ".[dev]"
```

```bash
# 2. Run everything with one command: API :8000 + Temporal worker + console :3000
./ops/dev.sh
# then open http://localhost:3000        ← the Studio Head console
#           http://localhost:8000/docs   ← the API
```

**Run `ops/dev.sh` rather than uvicorn alone.** Missions execute in the Temporal worker,
not in the API process, so an API started by itself accepts a mission and never runs it —
and `--reload` rebuilds the API on every edit while leaving the worker on whatever code it
started with. `ops/dev.sh` owns all three as one process group, so Ctrl-C stops the set and
nothing is left running against stale configuration. **If you change agent or workflow code,
restart it** — the worker does not reload itself.

With no keys this boots in MOCK mode: a deterministic fictional corpus, the whole mission
flow demonstrable offline, and every substrate chip reading MOCK rather than pretending.

```bash
# 3. Go LIVE: copy .env.example to .env and set
#    PARALLEL_API_KEY=...     → real Parallel Search API research
#    GOOGLE_API_KEY=...       → real Gemini cognition (or Vertex AI env vars)
```

Ask a question from the shell instead of the console:

```bash
curl -s -X POST localhost:8000/api/missions \
  -H 'content-type: application/json' \
  -d '{"objective": "Find emerging production companies worth monitoring"}'
# then poll:
curl -s localhost:8000/api/missions | python3 -m json.tool
```

## The console

The Studio Head console (Next.js, in [`frontend/`](frontend/)) has no dependencies beyond
React — every visual is hand-rolled, so there is nothing to audit but the code.

| On screen | What it is |
|---|---|
| **The world model** | The knowledge graph in 3D: a force simulation in x/y/z, projected through a rotation with perspective. It turns on its own and you can drag it. What the studio knows from several facts settles into the core, what rests on one fact sits on the surface — so the thin skin *is* how much is thinly sourced. |
| **Read as a paper** | `/missions/<id>/paper` — the whole record written up as a research paper: numbered sections, superscript citations resolving through each claim's own evidence to the page that produced it, block quotes of the retrieved text, disputed claims with both readings kept, and a reference list of everything read. Prints to PDF. |
| **Nested questions** | The rail tracks the ones being researched right now and clears them when they finish; each appears on the board with its own answer. |
| **The engine** | What Gemini actually did: every call, its role in plain language, latency, tokens, and — opened — the exact prompt and the exact response. |
| **The crew** | Every cognitive role as a sphere sized by what it has returned. Roles never called stay dark, because "only the roles an objective requires are instantiated" is only checkable if you can see the ones standing down. |
| **How the research is holding up** | Distributions rather than averages: what every claim stands on, how many sources agree claim by claim, and how much each line of enquiry brought back that held. |

## API

Everything the console renders is a documented endpoint; `/docs` is live OpenAPI.

| Endpoint | Returns |
|---|---|
| `POST /api/missions` | Ask a question. Rate-limited to protect Parallel/Gemini quota. |
| `GET /api/missions` | Every question and its outcome. `?include_failed_raised=true` also returns raised questions that retrieved nothing. |
| `GET /api/missions/{id}` | One mission in full: stages, tasks, sources, evidence, claims, findings, recommendation. |
| `POST /api/missions/{id}/decision` | The Studio Head boundary: `approved` / `rejected` / `more_research`. |
| `GET /api/nested-questions` | Questions the system raised from its own answers, and whether each was dispatched as a mission or folded into its parent. |
| `GET /api/vitals` | Verification mix, corroboration depth, per-domain hold-up rate, findings supported, confidence spread. |
| `GET /api/fleet` | Per-agent and per-domain work, counted over the whole event log. |
| `GET /api/agents` | The cast: standing roles and the domain specialists an objective can call up, with their permissions. |
| `GET /api/cognition` · `/summary` · `/{id}` | Gemini's own record: summaries, standing totals, and the exact prompt and response of one call. |
| `GET /api/knowledge/entities` · `relationships` · `graph` | The world model and its provenance edges. |
| `GET /api/evidence/search` · `similar` | Full-text recall (OpenSearch) and semantic recall (Qdrant + Gemini embeddings). |
| `GET /api/events` | The agent event stream. `?mission=<id>` for one mission's own activity wherever it sits in the log. |
| `GET /api/status` | Banner plus the runtime-proof states behind the console's footer. |

## Tests

```bash
.venv/bin/pytest -q
```

38 tests, all on the deterministic path — no credentials and no quota. They cover the
evidence lineage model, the three verification states (corroborated → VERIFIED, credible
disagreement → CONFLICTED and preserved, single-source → UNVERIFIED), and the full mission
flow end-to-end in mock mode including the Studio Head authorization boundary.

The nested-question half of the suite is written against specific failures rather than for
coverage, and each docstring names the one it prevents: an answer that raises the same
question twice, a stale shortfall crowding out the question a new answer just raised, a
raised question raising its own without bound, a rate limit read as an exhausted quota, and
a claim promoted twice becoming two things the studio believes.

## License

MIT — see [LICENSE](LICENSE).
