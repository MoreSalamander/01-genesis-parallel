"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_STATUSES, EventRecord, MissionDetail,
  decideMission, getEvents, getMission,
} from "@/lib/api";
import { MissionChip } from "../../components/Chips";
import { ClaimCards } from "../../components/ClaimCards";
import { Note, Rolling, Stream, VoiceLine, cascade, voiceFor } from "@/lib/alive";

const STATUS_ORDER: Record<string, number> = { VERIFIED: 0, CONFLICTED: 1, UNVERIFIED: 2 };

// The console's own voice. The chips keep the formal state for auditability;
// these say what the system is doing, in the first person, above them.
const VOICE: Record<string, string> = {
  PLANNED: "I've broken this into research tasks. Starting now.",
  RESEARCHING: "I'm reading the external record — pulling sources through Parallel.",
  VERIFYING: "I'm checking every claim against the sources that made it.",
  SYNTHESIZING: "I'm weighing what holds up against what doesn't.",
  RECOMMENDED: "I've reached a recommendation. I need your decision.",
  APPROVED: "Recorded — you approved this.",
  REJECTED: "Recorded — you rejected this.",
  MORE_RESEARCH_REQUESTED: "Understood. Going back for more evidence.",
  INCOMPLETE: "I couldn't finish this honestly. Nothing here is fabricated.",
};

export default function MissionPage() {
  const { id } = useParams<{ id: string }>();
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [deciding, setDeciding] = useState(false);
  const [actionNote, setActionNote] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [m, ev] = await Promise.all([getMission(id), getEvents(400)]);
      setMission(m);
      setEvents(ev.filter((e) => e.mission_id === id));
    } catch { /* backend may still be starting */ }
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      refresh();
    }, 1300);
    return () => clearInterval(timer);
  }, [refresh]);

  const claims = useMemo(
    () => (mission ? [...mission.claims].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) : []),
    [mission],
  );

  if (!mission) return <p className="muted">Loading mission…</p>;

  const unverified = mission.claims.filter((c) => c.status === "UNVERIFIED").length;
  const running = ACTIVE_STATUSES.has(mission.status);
  const rec = mission.recommendation;

  const decide = async (decision: "approved" | "rejected" | "more_research") => {
    if (deciding) return;
    setDeciding(true);
    setActionNote("");
    try {
      await decideMission(mission.id, decision);
      setActionNote(`Decision "${decision}" recorded.`);
      await refresh();
    } catch (err) {
      setActionNote(`Decision failed: ${String(err).slice(0, 200)}`);
    } finally { setDeciding(false); }
  };

  return (
    <main>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Intelligence mission</h2>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{mission.objective}</div>
            <div className="muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{mission.id}</div>
          </div>
          <MissionChip status={mission.status} running={running} />
        </div>
        <VoiceLine line={voiceFor(VOICE, mission.status)} thinking={running} />
        {mission.error && <Note tone="bad">{mission.error}</Note>}
      </section>

      {running && (
        <div className="ticker alive-active" role="status">
          <span className="pill">RETRIEVING</span>
          <span className="figure"><Rolling value={mission.sources.length} /> <span className="lbl">sources retrieved</span></span>
          <span className="sep">·</span>
          <span className="figure"><Rolling value={mission.evidence.length} /> <span className="lbl">evidence items</span></span>
          <span className="sep">·</span>
          <span className="figure"><Rolling value={mission.claims.length} /> <span className="lbl">claims extracted</span></span>
          <span className="sep">·</span>
          <span className="figure conflict"><Rolling value={mission.claims.filter((c) => c.status === "CONFLICTED").length} /> <span className="lbl">conflicts held</span></span>
        </div>
      )}

      <div className="tiles">
        <div className="tile"><div className="v"><Rolling value={mission.sources.length} /></div><div className="l">Sources</div></div>
        <div className="tile"><div className="v"><Rolling value={mission.evidence.length} /></div><div className="l">Evidence items</div></div>
        <div className="tile"><div className="v"><Rolling value={mission.claims.filter((c) => c.status === "VERIFIED").length} /></div><div className="l">Verified claims</div></div>
        <div className="tile"><div className="v"><Rolling value={mission.claims.filter((c) => c.status === "CONFLICTED").length} /></div><div className="l">Conflicts preserved</div></div>
        <div className="tile"><div className="v"><Rolling value={unverified} /></div><div className="l">Unverified</div></div>
      </div>

      <section className="panel">
        <h2>Mission timeline {running && <span className="muted">· running…</span>}</h2>
        <ul className="timeline alive-cascade">
          {mission.stages.map((s, i) => (
            <li key={i} style={cascade(i)}>
              <span className="t-name">{s.name}</span>{" "}
              <span className="t-at">{new Date(s.at).toLocaleTimeString()}</span>
              <div className="t-detail">{s.detail}</div>
            </li>
          ))}
        </ul>
      </section>

      {rec && (
        <section className="panel rec">
          <h2>Recommendation — Studio Head authorization required</h2>
          {/* Gemini's words, revealed as they would be written. An answer that
              composes itself reads as cognition; a paragraph that appears reads
              as a database. Click to skip — never make anyone wait to read. */}
          <p className="action"><Stream text={rec.action} /></p>
          <p className="rationale"><Stream text={rec.rationale} /></p>
          <div className="meter" role="img" aria-label={`Confidence ${Math.round(rec.confidence * 100)} percent`}>
            <div style={{ width: `${Math.round(rec.confidence * 100)}%` }} />
          </div>
          <div className="meter-label">{Math.round(rec.confidence * 100)}% confidence · grounded in {mission.claims.length} claim groups from {mission.sources.length} sources</div>
          {actionNote && <p className="muted">{actionNote}</p>}
          <div className="row" style={{ marginTop: 14 }}>
            {rec.decision ? (
              <span className="chip accent">Decision recorded: {rec.decision.toUpperCase()} {rec.decided_at ? `· ${new Date(rec.decided_at).toLocaleTimeString()}` : ""}</span>
            ) : (
              <>
                <button className="btn approve" disabled={deciding} onClick={() => decide("approved")}>✓ Approve</button>
                <button className="btn reject" disabled={deciding} onClick={() => decide("rejected")}>✕ Reject</button>
                <button className="btn" disabled={deciding} onClick={() => decide("more_research")}>↻ Request more research</button>
              </>
            )}
          </div>
        </section>
      )}

      {mission.findings.length > 0 && (
        <section className="panel">
          <h2>Strategic findings</h2>
          {mission.findings.map((f) => (
            <div key={f.id} className="claim">
              <div className="head">
                <span className="chip">{f.domain.toUpperCase()}</span>
                <span className={`chip ${f.strategic_impact === "HIGH" ? "accent" : ""}`}>IMPACT {f.strategic_impact}</span>
              </div>
              <div className="text"><Stream text={f.text} /></div>
            </div>
          ))}
        </section>
      )}

      {claims.length > 0 && (
        <section className="panel">
          <h2>Claims &amp; evidence <span className="muted">· grouped by entity, conflicts first</span></h2>
          <ClaimCards claims={claims} evidence={mission.evidence} sources={mission.sources} />
        </section>
      )}

      <section className="panel">
        <h2>Agent event log</h2>
        <div className="log">
          {events.slice(-40).reverse().map((e, i) => (
            <div key={i}><span className="e">{e.event}</span> {summarize(e)}</div>
          ))}
          {events.length === 0 && <span className="muted">No events yet.</span>}
        </div>
      </section>
    </main>
  );
}

function summarize(e: EventRecord): string {
  const skip = new Set(["event", "at", "mission_id"]);
  return Object.entries(e)
    .filter(([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(" ");
}
