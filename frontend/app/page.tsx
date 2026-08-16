"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ACTIVE_STATUSES, MissionSummary, SystemStatus,
  getStatus, listMissions, startMission,
} from "@/lib/api";
import { MissionChip } from "./components/Chips";
import { HowThisWorks } from "./components/HowThisWorks";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { Note, Rolling, VoiceLine, cascade, proofState, useCursorGlow } from "@/lib/alive";

/* The ask surface. Signal Intelligence is the studio's researcher, so the
   console leads with the question rather than with a form: you ask, it reads
   the external record through Parallel, and every answer arrives with the
   sources it stands on and the disagreements it refused to resolve. */

/* Open questions — only offered when Parallel retrieval is actually live,
   because only then can they be answered from the real external record. */
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

export default function Board() {
  const router = useRouter();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useCursorGlow();

  useEffect(() => {
    const load = () => {
      listMissions().then(setMissions).catch(() => {});
      getStatus().then(setStatus).catch(() => setStatus(null));
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

  const ask = async (text: string) => {
    const objective = text.trim();
    if (objective.length < 8 || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await startMission(objective);
      router.push(`/missions/${id}`);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const answered = missions.filter((m) => m.has_recommendation);

  return (
    <main className="ask-main">
      <HowThisWorks />

      <section className="ask">
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
      </section>

      {answered.length > 0 && (
        <section className="panel alive-raised">
          <h2>Answers on record <span className="muted">· every number traceable to a source</span></h2>
          <table>
            <thead>
              <tr><th>Question</th><th>Status</th><th>Sources</th><th>Held up</th><th>Conflicts</th></tr>
            </thead>
            <tbody className="alive-cascade">
              {missions.map((m, i) => (
                <tr key={m.id} style={cascade(i)}>
                  <td><Link href={`/missions/${m.id}`}>{m.objective}</Link></td>
                  <td><MissionChip status={m.status} running={ACTIVE_STATUSES.has(m.status)} /></td>
                  <td className="num"><Rolling value={m.sources} /></td>
                  <td className="num"><Rolling value={m.verified} /></td>
                  <td className="num"><Rolling value={m.conflicted} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <KnowledgeGraph />
    </main>
  );
}
