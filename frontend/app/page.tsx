"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ACTIVE_STATUSES, listMissions, startMission, MissionSummary } from "@/lib/api";
import { MissionChip } from "./components/Chips";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { EmptyState, Rolling, cascade } from "@/lib/alive";

const DEMO_OBJECTIVE = "Find emerging production companies worth monitoring";

export default function Board() {
  const router = useRouter();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [objective, setObjective] = useState(DEMO_OBJECTIVE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => listMissions().then(setMissions).catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const launch = async () => {
    if (!objective.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await startMission(objective.trim());
      router.push(`/missions/${id}`);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const signals = missions.reduce((n, m) => n + m.sources, 0);
  const verified = missions.reduce((n, m) => n + m.verified, 0);
  const conflicted = missions.reduce((n, m) => n + m.conflicted, 0);

  return (
    <main>
      <div className="tiles">
        <div className="tile"><div className="v"><Rolling value={signals} /></div><div className="l">External signals</div></div>
        <div className="tile"><div className="v"><Rolling value={missions.length} /></div><div className="l">Missions</div></div>
        <div className="tile"><div className="v"><Rolling value={verified} /></div><div className="l">Verified claims</div></div>
        <div className="tile"><div className="v"><Rolling value={conflicted} /></div><div className="l">Conflicts preserved</div></div>
      </div>

      {missions.length === 0 && (
        <EmptyState
          eyebrow="Signal Intelligence · Parallel track"
          title="External intelligence the studio can actually audit."
          lead="Give it an objective and the Executive plans research across Market, Talent, Industry
                and Strategic cognition, retrieves the evidence through Parallel Search, and verifies
                every claim against its sources. Where sources disagree the conflict is preserved and
                shown as CONFLICTED — never quietly resolved — and the recommendation comes back to you
                for authorization."
          action={
            <button className="btn approve" onClick={launch} disabled={busy}>
              {busy ? "Launching…" : `Start here — launch “${DEMO_OBJECTIVE}”`}
            </button>
          }
        />
      )}

      <section className="panel">
        <h2>New intelligence mission</h2>
        <div className="row">
          <input
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && launch()}
            placeholder="What should Signal Intelligence investigate?"
            aria-label="Intelligence objective"
          />
          <button className="btn approve" onClick={launch} disabled={busy}>
            {busy ? "Launching…" : "Launch mission"}
          </button>
        </div>
        {error && <p className="muted">{error}</p>}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          The Executive plans research across Market / Talent / Industry / Strategic cognition,
          retrieves evidence through Parallel Search, verifies claims, and returns a recommendation
          for your authorization.
        </p>
      </section>

      <section className="panel">
        <h2>Missions</h2>
        {missions.length === 0 ? (
          <p className="muted">No missions yet — launch one above.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Objective</th><th>Status</th><th>Sources</th><th>Verified</th><th>Conflicted</th></tr>
            </thead>
            <tbody className="alive-cascade">
              {missions.map((m, i) => (
                <tr key={m.id} style={cascade(i)}>
                  <td><Link href={`/missions/${m.id}`}>{m.objective}</Link></td>
                  <td><MissionChip status={m.status} running={ACTIVE_STATUSES.has(m.status)} /></td>
                  <td className="num">{m.sources}</td>
                  <td className="num">{m.verified}</td>
                  <td className="num">{m.conflicted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <KnowledgeGraph />
    </main>
  );
}
