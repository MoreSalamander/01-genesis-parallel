"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_STATUSES, EventRecord, MissionDetail,
  decideMission, getEvents, getMission,
} from "@/lib/api";
import { MissionChip } from "../../components/Chips";
import { ClaimCards } from "../../components/ClaimCards";
import { ThinkingPanel } from "../../components/ThinkingPanel";
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

  if (!mission) {
    return (
      <div className="answer-head">
        <div className="asked">fetching</div>
        <VoiceLine line="One moment — I'm pulling up everything I found for this question." thinking />
      </div>
    );
  }

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
      <header className="answer-head">
        <div className="asked">you asked</div>
        <h1 className="question">{mission.objective}</h1>
        <div className="row" style={{ gap: 12 }}>
          <MissionChip status={mission.status} running={running} />
          <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{mission.id}</span>
        </div>
        <VoiceLine line={voiceFor(VOICE, mission.status)} thinking={running} />
        {mission.error && <Note tone="bad">{mission.error}</Note>}
      </header>

      {rec && (
        <section className="answer">
          <div className="answer-label">the answer</div>
          {/* Gemini's words, revealed as they would be written. An answer that
              composes itself reads as cognition; a paragraph that appears reads
              as a database. Click to skip — never make anyone wait to read. */}
          <p className="action"><Stream text={rec.action} /></p>
          <p className="rationale"><Stream text={rec.rationale} /></p>
          {/* Written for someone reading this for the first time. Every term
              that could be jargon is explained in the same breath, because a
              Studio Head should not need the glossary to judge the answer. */}
          <div className="grounding">
            <p>
              I read <b>{mission.sources.length}</b> sources and pulled{" "}
              <b>{mission.claims.length}</b> separate factual statements out of them.
            </p>
            <ul>
              <li>
                <b>{mission.claims.filter((c) => c.status === "VERIFIED").length} confirmed</b> — more
                than one independent source said the same thing, so I treat these as solid.
              </li>
              <li>
                <b>{mission.claims.filter((c) => c.status === "CONFLICTED").length} disputed</b> — sources
                contradicted each other. I've kept both versions below instead of picking a winner,
                because guessing here is how bad decisions get made.
              </li>
              <li>
                <b>{unverified} single-source</b> — only one source said it. Useful leads, but I
                haven't been able to confirm them. Don't bet the slate on these.
              </li>
            </ul>
            <p className="conf">
              My confidence in the recommendation above is <b>{Math.round(rec.confidence * 100)}%</b> —
              that's how much of it rests on the confirmed material rather than the unconfirmed.
            </p>
          </div>
          {actionNote && <p className="muted">{actionNote}</p>}
          {!rec.decision && (
            <p className="decide-help">
              Nothing is saved until you decide. Accepting adds the confirmed facts to the studio's
              permanent knowledge; the disputed ones stay marked as disputed.
            </p>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {rec.decision ? (
              <span className="chip accent">Decision recorded: {rec.decision.toUpperCase()} {rec.decided_at ? `· ${new Date(rec.decided_at).toLocaleTimeString()}` : ""}</span>
            ) : (
              <>
                <button className="btn approve" disabled={deciding} onClick={() => decide("approved")}
                        title="Accept this answer. The confirmed facts are saved into what the studio knows, so future questions build on them.">
                  ✓ Accept this
                </button>
                <button className="btn reject" disabled={deciding} onClick={() => decide("rejected")}
                        title="Discard this answer. Nothing is saved to the studio's knowledge.">
                  ✕ Discard
                </button>
                <button className="btn" disabled={deciding} onClick={() => decide("more_research")}
                        title="Send it back to look harder — more sources, and another pass at the unconfirmed claims.">
                  ↻ Look deeper
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <ThinkingPanel mission={mission} events={events} running={running} />

      {mission.findings.length > 0 && (
        <section className="panel">
          <h2>What stood out <span className="muted">· the parts most likely to change a decision</span></h2>
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
          <h2>Everything I found <span className="muted">· grouped by who or what it’s about, disagreements first so you see them</span></h2>
          <ClaimCards claims={claims} evidence={mission.evidence} sources={mission.sources} />
        </section>
      )}

      <section className="panel">
        <h2>Step by step <span className="muted">· every stage, timestamped, so you can audit the route</span></h2>
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

      <section className="panel">
        <details className="raw-log">
          <summary>
            Raw agent log
            <span className="muted"> · the unedited machine record, if you want to check my work</span>
          </summary>
        <div className="log">
          {events.slice(-40).reverse().map((e, i) => (
            <div key={i}><span className="e">{e.event}</span> {summarize(e)}</div>
          ))}
          {events.length === 0 && <span className="muted">No events yet.</span>}
        </div>
        </details>
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
