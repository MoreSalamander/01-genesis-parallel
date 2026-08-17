"use client";
/* What Gemini actually did.

   Gemini is the cognitive engine (§4): it splits the question, pulls quotes out
   of pages, decides which claims corroborate each other, weighs the result, and
   audits its own answer against what was asked. Every one of those calls has
   been recorded in full since the ledger was written — prompt, response,
   latency, tokens, whether the JSON parsed — and the console never asked for
   any of it. The only trace on screen was a LIVE chip in the footer, which
   proves a key exists, not that a model reasoned.

   Nothing here is narrated: each row is one recorded call, and the times and
   token counts are the real ones. Opening a row fetches the exact prompt and
   the exact response, because "computed in code, narrated by Gemini" is only
   worth claiming if the wiring can be inspected. Slow calls are shown as slow
   (latency honesty, per the alive spec's anti-goals) and a malformed response
   is shown as malformed rather than quietly dropped. */

import { useEffect, useState } from "react";
import { CognitionCall, CognitionDetail, getCognition, getCognitionCall } from "@/lib/api";

/* The ledger's role names, said the way a Studio Head would say them. */
const ROLE: Record<string, string> = {
  research_plan: "split the question into lines of enquiry",
  evidence_extraction: "read a page and pulled the quotes out of it",
  verification_analysis: "grouped the statements and decided which ones corroborate each other",
  strategic_assessment: "weighed what held up into findings and a recommendation",
  sufficiency_check: "audited the answer against the question you actually asked",
};

const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export function GeminiLayer({ missionId, running }: { missionId: string; running: boolean }) {
  const [calls, setCalls] = useState<CognitionCall[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CognitionDetail | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => { getCognition(missionId, 60).then((c) => { if (alive) setCalls(c); }).catch(() => {}); };
    load();
    // Only poll while the mission is still thinking; a finished mission's
    // record does not change.
    if (!running) return () => { alive = false; };
    const timer = setInterval(load, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [missionId, running]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    let alive = true;
    getCognitionCall(openId).then((d) => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [openId]);

  if (calls.length === 0) return null;

  const tokens = calls.reduce((n, c) => n + (c.tokens?.total ?? 0), 0);
  const thinking = calls.reduce((n, c) => n + (c.ms ?? 0), 0);
  const failed = calls.filter((c) => !c.parsed_ok).length;
  const model = calls[0].model;
  const anyMock = calls.some((c) => !c.live);

  return (
    <section className={`panel gemini ${running ? "live" : ""}`}>
      <h2>
        What Gemini did
        <span className="muted">
          {" · "}{calls.length} call{calls.length === 1 ? "" : "s"} to {model}, {" "}
          {(tokens / 1000).toFixed(1)}k tokens, {secs(thinking)} of model time on this question
        </span>
      </h2>

      <p className="gemini-intro">
        The reasoning is Gemini&apos;s; the evidence and the arithmetic are not. Each row is one
        recorded call — open it to read the exact prompt it was sent and the exact response it
        returned.
        {anyMock && " Calls marked offline ran on the deterministic stand-in, not the model."}
        {failed > 0 && ` ${failed} response${failed === 1 ? "" : "s"} came back malformed and ${
          failed === 1 ? "was" : "were"} not silently accepted.`}
      </p>

      <ul className="gemini-calls">
        {calls.map((call) => {
          const open = openId === call.id;
          return (
            <li key={call.id} className={`gcall${open ? " open" : ""}${call.parsed_ok ? "" : " bad"}`}>
              <button className="gcall-head" onClick={() => setOpenId(open ? null : call.id)}
                      aria-expanded={open}>
                <span className="grole">{ROLE[call.role] ?? call.role}</span>
                <span className="gmeta">
                  {!call.live && <span className="gtag mock">offline</span>}
                  {!call.parsed_ok && <span className="gtag bad">malformed</span>}
                  <span className="gms">{secs(call.ms)}</span>
                  <span className="gtok">{(call.tokens?.total ?? 0).toLocaleString()} tok</span>
                </span>
              </button>
              {!open && call.preview && <p className="gpreview">{call.preview}</p>}
              {open && (
                <div className="gdetail">
                  {call.error && <p className="gerror">{call.error}</p>}
                  {detail && detail.id === call.id ? (
                    <>
                      <div className="gside">
                        <h4>what it was asked <span className="muted">{detail.prompt.length.toLocaleString()} chars</span></h4>
                        <pre>{detail.prompt}</pre>
                      </div>
                      <div className="gside">
                        <h4>what it returned <span className="muted">{detail.raw.length.toLocaleString()} chars</span></h4>
                        <pre>{detail.raw}</pre>
                      </div>
                    </>
                  ) : (
                    <p className="muted">fetching the record…</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
