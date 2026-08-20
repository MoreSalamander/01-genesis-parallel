# ADR 0002 — Nested questions: an answer that raises the next question

Status: accepted · 2026-08-17

Implements the locked Architecture Review V2 (see docs/architecture/). Choices below are
implementation-level; no locked decision is altered.

## Context

One pass stops as soon as it has *a* response. Asked for "the top 10 faceless YouTube ideas",
the system returned a recommendation to go and *select* some, justified by CPM data it did not
hold — one figure, from one page, marked disputed. The answer named its own missing input and
stopped. A system whose thesis is that evidence decides cannot ship that.

## Decisions

1. **The answer is audited against the provenance graph, not only by the model.** A model
   grading its own work fails in the flattering direction. The graph cannot: a finding with no
   verified claim beneath it is a missing edge, a claim with one corroborating source is thin
   ice, an entity the answer leans on with nothing recorded about it is absent. Both audits
   run — the graph says *where* the answer is unsupported, the model says *what to go and ask*,
   which a graph cannot judge. `app/knowledge/coverage.py`.

2. **The audit reports leads as well as holes, and leads never block completion.** After an
   answer lands, a researcher looks at the like things and continues the thread still open, so
   the audit also surfaces peers the studio already tracks and disagreements its own record is
   holding. These are deliberately not shortfalls: an answer is not incomplete because more
   could always be asked, and counting them as holes would mean no mission ever finished.

3. **One answer fans out across kinds, not depth.** Taken in arrival order a round filled with
   three unsupported findings — the same question three times. The round rotates through the
   kinds of shortfall instead, so it leaves with an unsupported finding, a single-source claim
   and a company nothing is confirmed about.

4. **A raised question becomes a mission of its own.** It gets a page, an answer, sources, a
   place on the board and a paper, because it is a question and that is what questions get
   here. It is marked (`raised_by`, `raised_because`) and never presented as one the Studio
   Head typed. The parent still absorbs what the child found, so one retrieval pass serves both.

5. **How wide a raised question researches is read off the context, not fixed.** "Is this
   corroborated elsewhere?" is one question and a wide plan re-covers the parent's ground;
   "what is confirmed about this company nobody has looked at?" is a subject, and two queries
   answer it with exactly the thin answer that raised it. The graph is asked how much the
   studio already holds on the thing, and the plan is taken at that width.

6. **Three bounds, because each question is real money.** The loop is capped at three rounds;
   at most four questions are raised per answer, counted across rounds so a later round cannot
   reset the budget; and a raised question never raises its own. Unbounded, four a round over
   two rounds dispatched eight extra missions per question asked. A question that retrieved
   nothing is not persisted at all — a failed attempt is not a question with an answer, and
   thirteen empty rows on the board is what persisting them looked like.

7. **The loop never asks the same question twice.** A hole the last round failed to close is
   still a hole, so the audit names it again; the loop keeps what it has asked across rounds
   and stops only when there is nothing new from either the graph or the model.

## Consequences

- A mission can now spend several missions' worth of Parallel and Gemini calls. The bounds
  above are the whole defence, and they are tested rather than documented-only.
- `intelligence.raised` joined the §14 event contract; the bus rejects unregistered events, so
  this was caught by the existing end-to-end test before it ran.
- Rate limits are waited out rather than reported as exhaustion (5s/20s/45s in
  `app/tools/google/gemini.py`). Vertex returns 429 RESOURCE_EXHAUSTED for a per-minute
  ceiling and a spent budget alike, and with no retry a transient limit killed a whole
  mission's work.
- Verification and synthesis are idempotent over a mission. Both run again on every
  round, and both used to append: the same fact stood twice with the older copy keeping
  the status it held before the corroboration arrived, and superseded findings stayed on
  the mission with the recommendation citing them. A re-run now replaces its own previous
  output, and a rebuilt claim inherits the id of whichever earlier claim held most of its
  evidence — the world model promotes by `claim_id`, so a fresh id would have moved the
  duplication one level down rather than fixed it. `ops/collapse_reverified_claims.py`
  puts already-stored missions into the state one pass would have produced.
- Promotion into the world model upserts on `claim_id`. `_build_knowledge` runs again on every
  round, and appending blindly made one claim into two, three, four things the studio believed.

## Verification

The nested-question suite is written against the specific failures above rather than for
coverage, and each docstring names the one it prevents. Proven end-to-end on a live worker:
a mission raised nested questions, one was dispatched, researched itself, reached its own
recommendation, and appeared on the board as its own question (`msn_36b18a118f94`).
