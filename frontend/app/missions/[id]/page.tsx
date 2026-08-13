"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_STATUSES, Claim, EventRecord, MissionDetail,
  decideMission, getEvents, getMission,
} from "@/lib/api";
import { MissionChip, VerifyChip } from "../../components/Chips";

const STATUS_ORDER: Record<string, number> = { VERIFIED: 0, CONFLICTED: 1, UNVERIFIED: 2 };

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

  const sourceById = new Map(mission.sources.map((s) => [s.id, s]));
  const evidenceById = new Map(mission.evidence.map((e) => [e.id, e]));
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
          <MissionChip status={mission.status} />
        </div>
        {mission.error && <p className="chip critical">! {mission.error}</p>}
      </section>

      <div className="tiles">
        <div className="tile"><div className="v">{mission.sources.length}</div><div className="l">Sources</div></div>
        <div className="tile"><div className="v">{mission.evidence.length}</div><div className="l">Evidence items</div></div>
        <div className="tile"><div className="v">{mission.claims.filter((c) => c.status === "VERIFIED").length}</div><div className="l">Verified claims</div></div>
        <div className="tile"><div className="v">{mission.claims.filter((c) => c.status === "CONFLICTED").length}</div><div className="l">Conflicts preserved</div></div>
        <div className="tile"><div className="v">{unverified}</div><div className="l">Unverified</div></div>
      </div>

      <section className="panel">
        <h2>Mission timeline {running && <span className="muted">· running…</span>}</h2>
        <ul className="timeline">
          {mission.stages.map((s, i) => (
            <li key={i}>
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
          <p className="action">{rec.action}</p>
          <p className="rationale">{rec.rationale}</p>
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
              <div className="text">{f.text}</div>
            </div>
          ))}
        </section>
      )}

      {claims.length > 0 && (
        <section className="panel">
          <h2>Claims &amp; evidence</h2>
          {claims.map((c) => (
            <ClaimCard key={c.id} claim={c} evidenceById={evidenceById} sourceById={sourceById} />
          ))}
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

function ClaimCard({ claim, evidenceById, sourceById }: {
  claim: Claim;
  evidenceById: Map<string, { claim_text: string; supporting_content: string; source_id: string }>;
  sourceById: Map<string, { title: string; url: string }>;
}) {
  return (
    <div className="claim">
      <div className="head">
        <VerifyChip status={claim.status} />
        {claim.entity && <span className="entity">{claim.entity}</span>}
        <span className="muted" style={{ fontSize: 12 }}>{claim.corroborating_sources} source{claim.corroborating_sources === 1 ? "" : "s"}</span>
      </div>
      <div className="text">{claim.text}</div>
      {claim.conflict_detail && <div className="conflict">⚠ {claim.conflict_detail} — disagreement preserved, not resolved.</div>}
      <details>
        <summary>Evidence trail ({claim.evidence_ids.length})</summary>
        {claim.evidence_ids.map((eid) => {
          const ev = evidenceById.get(eid);
          if (!ev) return null;
          const src = sourceById.get(ev.source_id);
          return (
            <div key={eid} className="evidence">
              <div>“{ev.supporting_content || ev.claim_text}”</div>
              {src && <div className="src">— <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a></div>}
            </div>
          );
        })}
      </details>
    </div>
  );
}

function summarize(e: EventRecord): string {
  const skip = new Set(["event", "at", "mission_id"]);
  return Object.entries(e)
    .filter(([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(" ");
}
