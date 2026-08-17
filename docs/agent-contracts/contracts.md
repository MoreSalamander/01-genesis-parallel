# Agent Contracts — Signal Intelligence

Interfaces between cognitive scopes (locked §2/§13). All cognition flows through the
role-based `Cognition.generate_json(role, payload)` interface, so agents are identical
in LIVE (Gemini via google-genai) and MOCK modes.

| Agent | Consumes | Produces | Permissions |
|---|---|---|---|
| Signal Intelligence Executive | Studio Head objective | Mission lifecycle, stages, events | read, analyze, recommend |
| Research Planner | objective + studio context | `ResearchTask[]` (domain, focus, queries, specialist) | read, analyze |
| Domain specialists (Market/Talent/Industry/Strategic rosters) | task focus | attribution for evidence provenance | read, analyze |
| Parallel Search tool | task focus + queries | `SearchResult[]` (url, title, excerpts) | read (external) |
| Verification Agent | Evidence[] | Claim[] with VERIFIED/UNVERIFIED/CONFLICTED + events | read, analyze |
| Strategic Cognition | Claim[] (all states) | Finding[], Recommendation + events | read, analyze, recommend |
| Coverage audit (no cognition) | Mission + context graph | `Hole[]` (where the chain runs out) and `Lead[]` (where it could go next) | read |
| Nested-question researcher | one raised question | a mission of its own: sources, evidence, claims, its own recommendation | read, analyze |
| Studio Head (human) | Recommendation + evidence trail | decision: approved / rejected / more_research | authorize |

## External Intelligence Contract (federation boundary, Handoff §16)

The standalone HTTP API doubles as the contract surface Genesis OS will adapt to later:

- `POST /api/missions {objective}` → mission id (intelligence request)
- `GET /api/missions/{id}` → full evidence/claims/findings/recommendation with provenance (intelligence result)
- `GET /api/events` → §14 event stream (`signal.discovered`, `claim.verified`, `claim.conflicted`, `recommendation.created`, `intelligence.gap_found`, `intelligence.raised`, …). `?mission=<id>` scopes it to one mission wherever its events sit in the log.
- `GET /api/nested-questions` → the questions this system raised from its own answers, each with the question that raised it and the mission that answered it (or `folded` where the research went back into its parent)

## Nested questions (the contract a consumer needs to know about)

An intelligence result may carry **questions the system asked itself**. A consumer has to be
able to tell those apart from questions its user asked, so:

- a raised mission carries `raised_by` (the mission that raised it) and `raised_because`
- the graph records `objective ─raised─> gap`, and `gap ─answered by─> objective` once it is
  dispatched as a mission
- `intelligence.raised` is emitted with the raising mission's id

Two bounds are part of the contract, because a consumer inherits their cost:
**at most four questions are raised per answer**, and **a raised question never raises its
own** — the tree is one level deep by construction, not by convention.

Genesis OS consumes this contract through an adapter; this system never calls Genesis OS.
