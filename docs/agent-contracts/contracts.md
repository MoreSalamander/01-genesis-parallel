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
| Studio Head (human) | Recommendation + evidence trail | decision: approved / rejected / more_research | authorize |

## External Intelligence Contract (federation boundary, Handoff §16)

The standalone HTTP API doubles as the contract surface Genesis OS will adapt to later:

- `POST /api/missions {objective}` → mission id (intelligence request)
- `GET /api/missions/{id}` → full evidence/claims/findings/recommendation with provenance (intelligence result)
- `GET /api/events` → §14 event stream (`signal.discovered`, `claim.verified`, `claim.conflicted`, `recommendation.created`, …)

Genesis OS consumes this contract through an adapter; this system never calls Genesis OS.
