# ADR 0001 — Builder implementation choices (Step 1 MVP)

Status: accepted · 2026-08-12

Implements the locked Architecture Review V2 (see docs/architecture/). Choices below are
implementation-level; no locked decision is altered.

1. **google-genai called directly** for all cognition through a role-based interface
   (`Cognition.generate_json`). `google-adk` is planned for the MCP-based systems
   (Grafana/ClickHouse); introducing it here added runtime surface without changing behavior.
2. **Mock mode** (no credentials) runs the identical agent pipeline against a deterministic,
   fully fictional corpus. Judges/users can run a clean clone offline; live mode switches on
   automatically when `PARALLEL_API_KEY` / Google credentials exist. `GENESIS_MOCK=1` forces
   mock for demo safety.
3. **Verification statuses are rule-derived** (corroborating distinct sources ≥ 2 → VERIFIED;
   contradiction → CONFLICTED; else UNVERIFIED). Cognition proposes grouping/contradictions;
   it cannot assign statuses directly — keeps LIVE mode honest.
4. **DataHub staged**: local JSON graph store is the working substrate; when `DATAHUB_GMS_URL`
   is set, promoted entities are mirrored to DataHub via acryl-datahub (optional extra).
   Locked DataHub role stays wired without making a heavy deployment a demo prerequisite.
5. **Knowledge promotion** (§10): VERIFIED promotes; CONFLICTED stored as explicitly disputed;
   UNVERIFIED remains episodic only.
6. **Parallel SDK surface (verified live, parallel-web v1.2.0)**: `client.search(search_queries=…,
   objective=…, max_chars_total=…, session_id=…)` returning `SearchResult.results[]` of
   `WebSearchResult{url, title, excerpts, publish_date}`. The mission id is passed as the Parallel
   `session_id` so all of a mission's searches share one research session. Gemini model default is
   the `gemini-flash-latest` alias — pinned `gemini-2.5-flash` returned 404 ("no longer available
   to new users") on a fresh 2026 account.
7. **No durable-workflow engine in the MVP** (Temporal is production direction per Handoff
   §22/§25); missions run as background tasks with an in-process working memory tier.
