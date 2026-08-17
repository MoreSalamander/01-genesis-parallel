"use client";
/* The persistent rail — the studio's vitals, always on screen.

   The console used to be a single scrolling document, which is why it read as
   a report rather than something running. The rail keeps what the studio knows
   in view no matter where you are: what it has looked at, what held up, and
   what it refuses to resolve. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ACTIVE_STATUSES, MissionSummary, NestedQuestion, getNestedQuestions, listMissions } from "@/lib/api";
import { Rolling } from "@/lib/alive";

export function Rail() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [nested, setNested] = useState<NestedQuestion[]>([]);
  const path = usePathname();

  useEffect(() => {
    const load = () => {
      listMissions().then(setMissions).catch(() => {});
      // Read from the graph, not from missions carrying raised_by: a question is
      // recorded when it is raised, and only some are dispatched as missions.
      getNestedQuestions(12).then(setNested).catch(() => {});
    };
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
        {nested.map((q, i) => {
          // Where the question goes when clicked: its own answer if it was
          // dispatched as a mission, otherwise the answer it was raised from,
          // which is where its research actually landed.
          const href = `/missions/${q.answered_by || q.raised_by}`;
          return (
            <Link
              href={href}
              key={`${q.question}-${i}`}
              className={`rail-item nested alive-track${path === href ? " on" : ""}`}
            >
              <span className="q">{q.question}</span>
              <span className="s">
                {q.status === "answered" ? "answered on its own" : "folded into the answer"}
                {q.raised_by_objective && <span className="from">from: {q.raised_by_objective}</span>}
              </span>
            </Link>
          );
        })}
      </div>

    </aside>
  );
}
