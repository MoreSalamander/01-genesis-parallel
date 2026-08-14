# Demo video script — Genesis OS: Signal Intelligence (Parallel track)

**Target ≤ 3:00.** Screen-record the console (localhost:3000 or the hosted URL) at
1920×1080; every beat below is a live-verified behavior (see genesis-reference/decisions.md).
Speak the lines conversationally; the console does the visual work.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Console masthead + mission list. Hover the LIVE badges. | "This is Signal Intelligence — an external-intelligence department for a film studio, built for the Parallel track. Gemini is the cognition. Parallel's Search API is every eye it has on the outside world. Nothing here is scripted — watch it work." |
| 0:15–0:35 | Type mission: **"Find emerging production companies worth monitoring."** Launch. Planner output appears. | "The Studio Head sets an objective, not a query. The Executive decomposes it across four cognitive domains — market, talent, industry, strategic — and plans real searches." |
| 0:35–1:05 | Evidence streaming in: source count climbing (dozens of real URLs), excerpts visible. | "Every source you see is a live Parallel Search retrieval — real publications, right now. The agents extract atomic claims from what came back. They never invent a fact." |
| 1:05–1:40 | Open a claim group: VERIFIED chips; then a **CONFLICTED** one showing disagreeing amounts/sources. | "Claims get corroborated across independent sources — that's VERIFIED. And when credible sources disagree, the system refuses to pick a winner: CONFLICTED, both sides preserved. That's the difference between intelligence and a summary." |
| 1:40–2:05 | Knowledge graph view (entities + relationships); flash the DataHub provenance entry. | "Verified knowledge lands in a graph — companies, people, deals — with full provenance mirrored to DataHub. The studio remembers *why* it believes things." |
| 2:05–2:30 | Recommendation card: action, rationale, confidence, evidence trail. | "Then a recommendation, grounded only in retrieved evidence, with its confidence and its trail. The system recommends —" |
| 2:30–2:45 | Click **APPROVE**. Status flips; events feed ticks. | "— and a human decides. Authority stays with the Studio Head." |
| 2:45–3:00 | Quick pan: Temporal UI (durable mission), stack line (PostgreSQL·NATS·Temporal·Redis·Qdrant·MinIO·OpenSearch·Neo4j·DataHub), repo README. | "Under it: durable Temporal workflows, a full production substrate, and one rule everywhere — Gemini thinks, Parallel observes, evidence decides. Genesis OS — Signal Intelligence." |

**Recording notes**
- Run one warm-up mission before recording so OpenSearch/Qdrant are hot.
- Keep the mission window ~45–75 s wall-clock: launch it, then narrate over the stream.
- If a CONFLICTED group doesn't surface this run, use the mission history entry that has one.
