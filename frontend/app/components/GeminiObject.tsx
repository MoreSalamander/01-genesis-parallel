"use client";
/* Gemini, as a thing on the board rather than a chip in the footer.

   Gemini does the reasoning here — it splits the question, reads the pages,
   decides what corroborates what, weighs the result, and audits its own answer.
   The board said none of that; it said "LIVE", which proves a key exists.

   So: an object that carries the work. The ring fills with where the model time
   actually went, role by role, and the core says what it is doing now or what it
   did last. Every number is read from the cognition ledger, which records the
   real prompt and the real response behind every call — this object is a view of
   that record, never a mood. When nothing is running it is still, and says the
   last thing it did rather than pretending to think. */

import { useEffect, useState } from "react";
import { GeminiSummary, getCognitionSummary } from "@/lib/api";
import { Rolling, useReducedMotion } from "@/lib/alive";

const ROLE_SHORT: Record<string, string> = {
  research_plan: "planning",
  evidence_extraction: "reading",
  verification_analysis: "checking",
  strategic_assessment: "weighing",
  sufficiency_check: "auditing",
};
const ROLE_SAID: Record<string, string> = {
  research_plan: "splitting a question into lines of enquiry",
  evidence_extraction: "reading a page and pulling the quotes out",
  verification_analysis: "deciding which statements corroborate each other",
  strategic_assessment: "weighing what held up into a recommendation",
  sufficiency_check: "auditing an answer against the question asked",
};

const mins = (ms: number) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)}s`);

export function GeminiObject({ running }: { running: boolean }) {
  const [gem, setGem] = useState<GeminiSummary | null>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const load = () => { getCognitionSummary().then(setGem).catch(() => {}); };
    load();
    const timer = setInterval(load, running ? 2000 : 20000);
    return () => clearInterval(timer);
  }, [running]);

  if (!gem || gem.calls === 0) return null;

  // The ring is where the model's time went, not a decorative sweep.
  let offset = 0;
  const arcs = gem.by_role.map((role) => {
    const share = gem.ms > 0 ? role.ms / gem.ms : 0;
    const arc = { role: role.role, share, start: offset };
    offset += share;
    return arc;
  });

  const latest = gem.latest;
  const doing = latest ? (ROLE_SAID[latest.role] ?? latest.role) : "";

  return (
    <section className={`panel gemini-object${running && !still ? " thinking" : ""}`}>
      <h2>
        The engine
        <span className="muted">{" · "}Gemini does the reasoning; the evidence and the arithmetic do not come from it</span>
      </h2>

      <div className="engine">
        <div className="engine-ring" role="img"
             aria-label={`Model time by task: ${gem.by_role.map((r) => `${ROLE_SHORT[r.role] ?? r.role} ${Math.round((r.ms / Math.max(1, gem.ms)) * 100)}%`).join(", ")}`}>
          <svg viewBox="0 0 120 120">
            <circle className="track" cx="60" cy="60" r="52" />
            {arcs.map((arc, i) => (
              <circle
                key={arc.role}
                className={`arc a${i}`}
                cx="60" cy="60" r="52"
                strokeDasharray={`${arc.share * 326.7} 326.7`}
                strokeDashoffset={`${-arc.start * 326.7}`}
              />
            ))}
          </svg>
          <div className="engine-core">
            <span className="n"><Rolling value={gem.calls} /></span>
            <span className="l">calls</span>
          </div>
        </div>

        <div className="engine-read">
          <p className="engine-now">
            {running ? <>Right now it is <b>{doing}</b>.</> : <>Last it was <b>{doing}</b>.</>}
          </p>
          <div className="engine-figs">
            <span><b>{(gem.tokens / 1000).toFixed(0)}k</b> tokens</span>
            <span><b>{mins(gem.ms)}</b> of model time</span>
            <span><b>{gem.model}</b></span>
          </div>
          <ul className="engine-roles">
            {gem.by_role.map((role, i) => (
              <li key={role.role}>
                <span className={`key a${i}`} aria-hidden="true" />
                <span className="rn">{ROLE_SHORT[role.role] ?? role.role}</span>
                <span className="rc">{role.calls} call{role.calls === 1 ? "" : "s"}</span>
                <span className="rm">{mins(role.ms)}</span>
              </li>
            ))}
          </ul>
          <p className="engine-foot muted">
            {gem.live} of {gem.calls} on record ran against the model
            {gem.malformed > 0 && <>, and {gem.malformed} came back malformed rather than being
              quietly accepted</>}. The ledger keeps the last {gem.on_record}, so this is the recent
            record and not an all-time total.
          </p>
        </div>
      </div>
    </section>
  );
}
