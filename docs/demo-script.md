# Demo video script — Genesis OS: Signal Intelligence (Parallel track)

**Target ≤ 3:00.** Screen-record the console (localhost:3000 or the hosted URL) at
1920×1080; every beat below is a live-verified behavior (see genesis-reference/decisions.md).
Speak the lines conversationally; the console does the visual work.

The spine of this cut is the thing the system does that a search wrapper cannot:
**an answer is read back against its own evidence, and what it left thin becomes the next
question.** Give that its full thirty seconds even if something else has to go.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | Console masthead. Hover the footer chips — Gemini · Parallel · Temporal · DataHub, each LIVE. | "This is Signal Intelligence — an external-intelligence department for a film studio, built for the Parallel track. Gemini is the cognition, Parallel's Search API is every eye it has on the outside world, and those chips only say LIVE once a substrate has actually been used." |
| 0:12–0:32 | Type **"Find emerging production companies worth monitoring."** Launch. Planner output appears; scroll to **the crew** and let the spheres light. | "The Studio Head sets an objective, not a query. It decomposes across four cognitive domains, and only the roles the question needs are instantiated — the dark spheres are the specialists it decided it didn't need." |
| 0:32–0:55 | Evidence streaming: source count climbing with real URLs. Cut to **the engine** and open one call. | "Every source is a live Parallel retrieval. And this is Gemini's own record — every call it made, what it was asked, and exactly what it returned. Fifty thousand characters of prompt, on screen, checkable." |
| 0:55–1:22 | A claim group: VERIFIED chips. Then a **CONFLICTED** one, both amounts and both sources visible. | "Claims corroborated across independent sources are confirmed. When credible sources disagree, it refuses to pick a winner — both readings preserved. That's the difference between intelligence and a summary." |
| 1:22–1:52 | **The nested questions beat.** Show the answer, then the audit: a finding resting on nothing verified. Cut to the rail as a nested question is worked, then to the board where it sits with its own answer. | "Then it reads its own answer back against the evidence graph — which can't flatter itself, because a finding with no verified claim underneath it is a missing edge, not an opinion. Every shortfall becomes a real question, researched on its own, with its own answer on the board. Asked for ten ideas, it used to hand back a plan to go and find ten. Now it goes and finds them." |
| 1:52–2:12 | **The world model**, turning. Drag it once. Point at the dense core, then the thin outer shell. | "This is everything the studio knows, and its shape is the claim: what it knows from several facts sits in the core, what rests on a single page sits out on the skin. That thin skin is how much is thinly sourced — it isn't hidden from you." |
| 2:12–2:32 | Recommendation card: action, rationale, confidence. Click **APPROVE**; status flips, the rail ticks. | "A recommendation grounded only in retrieved evidence, with its confidence and its trail. The system recommends — and a human decides. Authority stays with the Studio Head." |
| 2:32–2:52 | Click **read as a paper**. Scroll the citations, a block quote, the disputed section, the reference list. | "And the whole thing writes itself up. Every claim cites the page it came from, the quotes are the real retrieved text, disagreements keep both sides, and everything it read is listed. A studio can forward this, or print it." |
| 2:52–3:00 | Quick pan: Temporal UI (durable mission), the stack line (PostgreSQL · NATS · Temporal · Redis · Qdrant · MinIO · OpenSearch · Neo4j · DataHub). | "Durable Temporal workflows, a full production substrate, and one rule everywhere — Gemini thinks, Parallel observes, evidence decides. Genesis OS — Signal Intelligence." |

## Recording notes

- **Restart `ops/dev.sh` before you record if you have touched agent or workflow code.**
  Missions execute in the Temporal worker, which does not reload — recording against a stale
  worker shows the old behavior while the repo shows the new, and it is very hard to spot.
- Run one warm-up mission before recording so OpenSearch/Qdrant are hot.
- Keep the mission window ~45–75 s wall-clock: launch it, then narrate over the stream.
- **Have a mission with nested questions ready.** They are raised after the first answer, so
  the 1:22 beat is easier to cut from a finished mission's board and rail than to catch live.
  `GET /api/nested-questions` tells you which missions have them.
- If a CONFLICTED group doesn't surface this run, use a history entry that has one.
- Live retrieval can pause: a Vertex rate limit is waited out (5s, 20s, 45s), so a mission can
  sit apparently still for up to a minute. Cut those pauses rather than narrating them.
- The paper prints — if you want a still for the submission, `print / save as PDF` from that
  page gives a clean document with no console chrome.
