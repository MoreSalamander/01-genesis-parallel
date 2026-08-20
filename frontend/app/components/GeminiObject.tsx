"use client";
/* The engine: what Gemini just said, in its own words.

   This panel has twice been a summary of five roles — first a donut with a
   legend, then a proportional bar with a table. Both answered "where did the
   model time go", which is an accounting question, and neither showed the engine
   doing anything. A studio head watching a demo learns nothing from a pie of
   token spend.

   What the ledger actually holds is better than any chart of it: every call's
   exact prompt and exact response. So the panel is the tape — the last calls,
   newest first, each carrying the real text that came back, openable to the full
   prompt and full response. It is unfakeable in a way a percentage is not: you
   can read the reasoning and go to the question it belonged to.

   The arithmetic that used to be the whole panel is one line at the bottom now,
   which is the weight it deserves. */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CognitionCall, CognitionDetail, GeminiSummary,
  getCognition, getCognitionCall, getCognitionSummary,
} from "@/lib/api";
import { Rolling, useReducedMotion } from "@/lib/alive";

const ROLE_SAID: Record<string, string> = {
  research_plan: "split a question into lines of enquiry",
  evidence_extraction: "read a page and pulled the quotes out",
  verification_analysis: "decided which statements corroborate each other",
  strategic_assessment: "weighed what held up into a recommendation",
  sufficiency_check: "audited an answer against the question asked",
};
const ROLE_SHORT: Record<string, string> = {
  research_plan: "planning",
  evidence_extraction: "reading",
  verification_analysis: "checking",
  strategic_assessment: "weighing",
  sufficiency_check: "auditing",
};
/* Stable colours: a role keeps its tick whatever order the tape arrives in. */
const ROLE_KEY: Record<string, number> = {
  verification_analysis: 0, evidence_extraction: 1, strategic_assessment: 2,
  research_plan: 3, sufficiency_check: 4,
};

function dur(ms: number): string {
  if (ms >= 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.round((ms % 3_600_000) / 60_000);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

/* Tokens ran through `(n / 1000).toFixed(0) + "k"`, which printed two million
   tokens as "2145k" — a number nobody carries in their head. */
function count(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/* The recorded response is JSON, and the first 220 characters of JSON are mostly
   braces. Every role puts its human sentence in a known field, so the tape shows
   that sentence rather than the syntax around it — and falls back to the raw text
   rather than to nothing, because a response that did not parse is exactly the
   one worth reading. */
const SAYS = /"(?:reason|claim|text|action|focus|statement|question)"\s*:\s*"((?:[^"\\]|\\.){15,})/;
function said(preview: string): string {
  const keyed = preview.match(SAYS);
  if (keyed) return keyed[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
  const anyString = preview.match(/"((?:[^"\\]|\\.){25,})/);
  if (anyString) return anyString[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
  return preview.replace(/\s+/g, " ").trim();
}

export function GeminiObject({ running }: { running: boolean }) {
  const [calls, setCalls] = useState<CognitionCall[]>([]);
  const [gem, setGem] = useState<GeminiSummary | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CognitionDetail | null>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const load = () => {
      getCognition("", 7).then(setCalls).catch(() => {});
      getCognitionSummary().then(setGem).catch(() => {});
    };
    load();
    const timer = setInterval(load, running ? 2000 : 20000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    let alive = true;
    getCognitionCall(openId).then((d) => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [openId]);

  if (!gem || gem.calls === 0) return null;

  const live = running && !still;
  const share = [...gem.by_role].sort((a, b) => b.ms - a.ms);
  const totalMs = Math.max(1, gem.ms);

  return (
    <section className={`panel gemini-object${live ? " thinking" : ""}`}>
      <h2>
        The engine
        <span className="muted">{" · "}every call it made, and exactly what came back</span>
      </h2>

      <ol className="engine-tape">
        {calls.map((call) => {
          const open = openId === call.id;
          const key = ROLE_KEY[call.role] ?? 4;
          return (
            <li key={call.id} className={`${open ? "open" : ""}${call.parsed_ok ? "" : " bad"}`}>
              <button
                className="tape-row"
                onClick={() => setOpenId(open ? null : call.id)}
                aria-expanded={open}
                title={open ? "Close" : "Show the exact prompt and the exact response"}
              >
                <span className={`tick a${key}`} aria-hidden="true" />
                <span className="what">{ROLE_SHORT[call.role] ?? call.role}</span>
                <span className="said">
                  {call.parsed_ok
                    ? said(call.preview)
                    : <em>came back malformed — {said(call.preview) || "nothing usable"}</em>}
                </span>
                <span className="cost">
                  {dur(call.ms)}
                  <i>{count(call.tokens?.total ?? 0)}</i>
                </span>
              </button>

              {open && (
                <div className="tape-detail">
                  <p className="td-head">
                    {ROLE_SAID[call.role] ?? call.role}
                    {call.ref && (
                      <> · <Link href={`/missions/${call.ref}`}>the question this was for →</Link></>
                    )}
                  </p>
                  {detail && detail.id === call.id ? (
                    <>
                      <h4>what it was asked</h4>
                      <pre className="td-text">{detail.prompt}</pre>
                      <h4>what it answered</h4>
                      <pre className="td-text">{detail.raw}</pre>
                    </>
                  ) : (
                    <p className="td-wait">reading the record…</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* The standing totals, at the weight they are worth. The hairline keeps
          the one thing the old table was good for: checking is called a third as
          often as reading and costs more time than it — the expensive thought
          here is deciding what corroborates what, not reading pages. */}
      <div className="engine-standing">
        <div className="engine-hair" role="img"
             aria-label={`Model time by task: ${share.map((r) => `${ROLE_SHORT[r.role] ?? r.role} ${Math.round((r.ms / totalMs) * 100)}%`).join(", ")}`}>
          {share.map((role) => (
            <span
              key={role.role}
              className={`seg a${ROLE_KEY[role.role] ?? 4}`}
              style={{ width: `${(role.ms / totalMs) * 100}%` }}
              title={`${ROLE_SHORT[role.role] ?? role.role} — ${role.calls} calls, ${dur(role.ms)}, ${dur(Math.round(role.ms / Math.max(1, role.calls)))} each`}
            />
          ))}
        </div>
        <p className="engine-figs">
          <span><b><Rolling value={gem.calls} /></b> calls</span>
          <span><b>{count(gem.tokens)}</b> tokens</span>
          <span><b>{dur(gem.ms)}</b> of model time</span>
          <span>
            most of it <b>{ROLE_SHORT[share[0]?.role] ?? "—"}</b>
            {share[0] && ` (${Math.round((share[0].ms / totalMs) * 100)}%, ${dur(Math.round(share[0].ms / Math.max(1, share[0].calls)))} a call)`}
          </span>
          <span className="rm">{gem.model}</span>
        </p>
        <p className="engine-foot muted">
          {gem.live} of {gem.calls} on record ran against the model
          {gem.malformed > 0 && <>, and {gem.malformed} came back malformed rather than being
            quietly accepted</>}. The ledger keeps the last {gem.on_record}, so this is the recent
          record and not an all-time total.
        </p>
      </div>
    </section>
  );
}
