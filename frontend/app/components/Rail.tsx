"use client";
/* The persistent rail — the studio's vitals, always on screen.

   The console used to be a single scrolling document, which is why it read as
   a report rather than something running. The rail keeps what the studio knows
   in view no matter where you are: what it has looked at, what held up, and
   what it refuses to resolve. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MissionSummary, listMissions } from "@/lib/api";
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
  const open = missions.filter((m) => !m.has_recommendation).length;

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

      <div className="rail-block">
        <div className="rail-head">recent answers</div>
        {missions.length === 0 && <div className="rail-empty">nothing asked yet</div>}
        {missions.slice(0, 8).map((m) => (
          <Link
            href={`/missions/${m.id}`}
            key={m.id}
            className={`rail-item alive-track${path === `/missions/${m.id}` ? " on" : ""}`}
          >
            <span className="q">{m.objective}</span>
            <span className="s">
              {m.sources} sources
              {m.conflicted > 0 ? ` · ${m.conflicted} conflict${m.conflicted === 1 ? "" : "s"}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
