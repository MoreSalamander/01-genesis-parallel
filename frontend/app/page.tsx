"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ACTIVE_STATUSES, EventRecord, MissionSummary, SystemStatus,
  getEvents, getStatus, groupByQuestion, listMissions, startMission,
} from "@/lib/api";
import { HowThisWorks } from "./components/HowThisWorks";
import { ContextGraph } from "./components/ContextGraph";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { Feed, Panel, Readout, Ring, RingLegend } from "./components/Hud";
import { Note, VoiceLine, cascade, proofState, useCursorGlow } from "@/lib/alive";

/* The board.

   Signal Intelligence is the studio's researcher, so the console still leads
   with the question — you ask, it reads the external record, and every answer
   arrives with the sources it stands on and the disagreements it kept.

   Around that sits the instrumentation, and the instruments are chosen for
   what a Studio Head actually needs to trust a researcher: how much has it
   read, how much of what it found held up, what did it refuse to resolve, and
   what is it doing right now. Each one is bound to a number the backend
   produced. None of them move unless the number moved. */

const LIVE_STARTERS = [
  "What does it actually cost to produce a short film in 2026?",
  "Which festivals matter most for a first feature?",
  "How do independent studios land distribution deals?",
  "Who is investing in virtual production right now?",
  "What are streamers paying for documentaries?",
  "Find emerging production companies worth monitoring",
];

/* Without a Parallel key the system reads a small fixed demonstration corpus,
   so these are the questions it can genuinely answer. Offering the open set
   here would promise research the system cannot do. */
const FIXTURE_STARTERS = [
  "Find emerging production companies worth monitoring",
  "Which production companies raised funding recently?",
  "What distribution deals have independent studios signed?",
  "Which creative leaders changed studios recently?",
  "Who is building virtual production capacity?",
];

/* What happened to a question, said the way you would say it. */
const OUTCOME: Record<string, { word: string; cls: string }> = {
  APPROVED: { word: "You accepted this", cls: "ok" },
  REJECTED: { word: "You discarded this", cls: "off" },
  MORE_RESEARCH_REQUESTED: { word: "Sent back for more", cls: "busy" },
  RECOMMENDED: { word: "Waiting on your decision", cls: "wait" },
  INCOMPLETE: { word: "Couldn’t finish honestly", cls: "off" },
};

export default function Board() {
  const router = useRouter();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  useCursorGlow();

  useEffect(() => {
    const load = () => {
      listMissions().then(setMissions).catch(() => {});
      getStatus().then(setStatus).catch(() => setStatus(null));
      getEvents(60).then(setEvents).catch(() => {});
    };
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  // Retrieval breadth is the whole promise here, so the surface only offers
  // open questions when Parallel can actually go and answer them.
  const retrieval = proofState(status?.runtime_proof, "parallel", status?.parallel_live ?? false);
  const liveRetrieval = retrieval === "LIVE";
  const starters = liveRetrieval ? LIVE_STARTERS : FIXTURE_STARTERS;

  // Totals across every question ever asked. These are sums of recorded
  // per-mission counts — nothing is estimated.
  const sources = missions.reduce((n, m) => n + m.sources, 0);
  const claims = missions.reduce((n, m) => n + m.claims, 0);
  const verified = missions.reduce((n, m) => n + m.verified, 0);
  const conflicted = missions.reduce((n, m) => n + m.conflicted, 0);
  const answered = missions.filter((m) => m.has_recommendation).length;
  const running = missions.some((m) => ACTIVE_STATUSES.has(m.status));
  // Repeats of a question collapse into one entry showing the latest run.
  const asked = groupByQuestion(missions);

  const ask = async (text: string) => {
    const objective = text.trim();
    if (objective.length < 8 || busy) return;
    setBusy(true);
    setError("");
    // The board pulls back while the question is being opened. This overlaps
    // the request rather than delaying it, so the transition is free.
    setLeaving(true);
    try {
      const { id } = await startMission(objective);
      router.push(`/missions/${id}`);
    } catch (err) {
      setError(String(err));
      setBusy(false);
      setLeaving(false);
    }
  };

  return (
    <main className={`board${leaving ? " leaving" : ""}`}>
      <HowThisWorks />

      <Panel className="ask-panel">
        <VoiceLine
          className="alive-voice-hero"
          line={liveRetrieval
            ? "Ask me anything about running a studio. I'll read the external record and show you every source I used — including the ones that disagree."
            : "I'm running on a small demonstration corpus right now, so I can only answer what's in it. Connect a Parallel key and I'll read the open web instead."}
        />

        <div className="ask-row alive-track">
          <input
            className="ask-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="What do you want to know?"
            aria-label="Ask the studio anything"
            autoFocus
          />
          <button className="btn approve alive-track" onClick={() => ask(question)}
                  disabled={busy || question.trim().length < 8}>
            {busy ? "Reading…" : "Ask"}
          </button>
        </div>

        {!liveRetrieval && (
          <Note>
            Demonstration corpus: 8 fixture documents about production companies. Questions outside
            it return no sources rather than an answer assembled from unrelated ones.
          </Note>
        )}

        <div className="starters alive-cascade">
          {starters.map((s, i) => (
            <button key={s} className="starter alive-track" style={cascade(i)}
                    onClick={() => { setQuestion(s); ask(s); }} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        {error && <p className="muted">{error}</p>}
      </Panel>

      {/* The wall: what it has learned, what it knows, what it is doing. */}
      <div className="wall">
        <Panel title="How the research is holding up" className="vitals">
          <div className="ring-row">
            <Ring
              value={verified} total={claims}
              label="held up" tone="ok"
              hint={`${verified} of ${claims} claims confirmed by more than one source`}
            />
            <Ring
              value={conflicted} total={claims}
              label="disputed" tone="warn"
              hint={`${conflicted} kept as disagreements rather than resolved`}
            />
            <Ring
              value={answered} total={missions.length}
              label="answered" tone=""
              hint={`${answered} of ${missions.length} questions reached a recommendation`}
            />
          </div>
          <RingLegend
            items={[
              { tone: "ok", has: claims > 0, hint: `${verified} of ${claims} claims confirmed by more than one source` },
              { tone: "warn", has: claims > 0, hint: `${conflicted} kept as disagreements rather than resolved` },
              { tone: "", has: missions.length > 0, hint: `${answered} of ${missions.length} questions reached a recommendation` },
            ]}
          />
          <div className="readout-row">
            <Readout n={sources} label="sources read" />
            <Readout n={claims} label="claims made" />
            <Readout n={status?.episodic ?? 0} label="things it remembers" />
          </div>
          <p className="vitals-note">
            Disputed is not a failure. When sources disagree the researcher keeps both and tells
            you, rather than picking the one that reads better.
          </p>
        </Panel>

        <div className="centre">
          <KnowledgeGraph running={running} />
        </div>

        <Panel
          title="Live activity"
          meta={running ? <span className="hp-live">working</span> : <span className="hp-idle">idle</span>}
          className="activity"
        >
          <Feed events={events} />
        </Panel>
      </div>

      {missions.length > 0 && (
        <Panel
          title="Everything you have asked"
          className="answers"
          foldId="asked"
          meta={`${asked.length} question${asked.length === 1 ? "" : "s"}${
            asked.length === missions.length ? "" : ` · ${missions.length} runs`} · newest first`}
        >
          <ul className="answer-list alive-cascade">
            {asked.map(({ latest: m, times }, i) => {
              const state = OUTCOME[m.status] ?? { word: "Working on it", cls: "busy" };
              return (
                <li key={m.id} style={cascade(i)}>
                  <Link href={`/missions/${m.id}`} className="answer-row alive-track">
                    <span className="q">{m.objective}</span>
                    <span className="line">
                      <span className={`state ${state.cls}`}>{state.word}</span>
                      <span className="sep">·</span>
                      <span>{m.sources} sources read</span>
                      {m.verified > 0 && <><span className="sep">·</span><span>{m.verified} confirmed</span></>}
                      {m.conflicted > 0 && (
                        <><span className="sep">·</span>
                        <span className="conflict">
                          {m.conflicted} disagreement{m.conflicted === 1 ? "" : "s"} kept
                        </span></>
                      )}
                      {times > 1 && (
                        <><span className="sep">·</span>
                        <span className="muted">asked {times}× — showing the latest</span></>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <ContextGraph />
    </main>
  );
}
