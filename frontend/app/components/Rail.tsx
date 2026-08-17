"use client";
/* The persistent rail — the studio's vitals, always on screen.

   The console used to be a single scrolling document, which is why it read as
   a report rather than something running. The rail keeps what the studio knows
   in view no matter where you are: what it has looked at, what held up, and
   what it refuses to resolve. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ACTIVE_STATUSES, MissionSummary, listMissions } from "@/lib/api";
import { Rolling } from "@/lib/alive";

export function Rail() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const path = usePathname();

  useEffect(() => {
    const load = () => listMissions().then(setMissions).catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const sources = missions.reduce((n, m) => n + m.sources, 0);
  const verified = missions.reduce((n, m) => n + m.verified, 0);
  const conflicted = missions.reduce((n, m) => n + m.conflicted, 0);
  // In flight means genuinely running. A mission that ended INCOMPLETE has no
  // recommendation but is finished — counting it as working left dead missions
  // "in flight" for days.
  const open = missions.filter((m) => ACTIVE_STATUSES.has(m.status)).length;
  // Nested questions: the ones the loop raised from an answer. Being worked
  // through comes first — the rest newest first.
  const byId = new Map(missions.map((m) => [m.id, m]));
  const nested = missions
    .filter((m) => m.raised_by)
    .sort((a, b) => {
      const working = Number(ACTIVE_STATUSES.has(b.status)) - Number(ACTIVE_STATUSES.has(a.status));
      return working !== 0 ? working : b.created_at.localeCompare(a.created_at);
    });

  const vitals = [
    { label: "answers", value: missions.length },
    { label: "sources read", value: sources },
    { label: "claims that held", value: verified },
    { label: "conflicts kept", value: conflicted, hot: conflicted > 0 },
  ];

  return (
    <aside className="rail">
      <div className="rail-block">
        <div className="rail-head">what it knows</div>
        {vitals.map((v) => (
          <div className={`vital${v.hot ? " hot" : ""}`} key={v.label}>
            <span className="v"><Rolling value={v.value} /></span>
            <span className="l">{v.label}</span>
          </div>
        ))}
      </div>

      {open > 0 && (
        <div className="rail-block">
          <div className="rail-head">working</div>
          <div className="rail-working">
            <span className="alive-think" aria-hidden="true"><i /><i /><i /></span>
            {open} question{open === 1 ? "" : "s"} in flight
          </div>
        </div>
      )}

      {/* Nested questions, not a second copy of the question list. The rail
          used to repeat the eight most recent answers, which the board already
          shows in full — so the always-on slot said nothing you could not see by
          scrolling. What is worth keeping in view is the enquiry extending
          itself: an answer audited against the context graph, the graph naming
          what is thin, and each shortfall going off to be researched as a
          question of its own. In flight first, because that is the part that
          changes while you watch. */}
      <div className="rail-block">
        <div className="rail-head">nested questions</div>
        {nested.length === 0 && (
          <div className="rail-empty">
            {missions.length === 0
              ? "nothing asked yet"
              : "none yet — an answer that leaves something thin raises one here"}
          </div>
        )}
        {nested.slice(0, 8).map((m) => {
          const parent = byId.get(m.raised_by);
          const working = ACTIVE_STATUSES.has(m.status);
          return (
            <Link
              href={`/missions/${m.id}`}
              key={m.id}
              className={`rail-item nested${working ? " working" : ""} alive-track${
                path === `/missions/${m.id}` ? " on" : ""}`}
            >
              <span className="q">{m.objective}</span>
              <span className="s">
                {working
                  ? <span className="alive-think" aria-hidden="true"><i /><i /><i /></span>
                  : `${m.sources} sources`}
                {parent && <span className="from">from: {parent.objective}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
