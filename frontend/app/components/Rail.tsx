"use client";
/* The persistent rail — the studio's vitals, always on screen.

   The console used to be a single scrolling document, which is why it read as
   a report rather than something running. The rail keeps what the studio knows
   in view no matter where you are: what it has looked at, what held up, and
   what it refuses to resolve. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ACTIVE_STATUSES, EventRecord, MissionSummary, NestedQuestion,
  getEvents, getNestedQuestions, listMissions,
} from "@/lib/api";
import { Feed } from "./Hud";
import { Rolling } from "@/lib/alive";

export function Rail() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [nested, setNested] = useState<NestedQuestion[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const path = usePathname();

  useEffect(() => {
    const load = () => {
      listMissions().then(setMissions).catch(() => {});
      // Read from the graph, not from missions carrying raised_by: a question is
      // recorded when it is raised, and only some are dispatched as missions.
      getNestedQuestions(40).then(setNested).catch(() => {});
      // Live activity belongs beside the questions it is activity on, not in a
      // column of its own across the board.
      getEvents(60).then(setEvents).catch(() => {});
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

  // A nested question is in the tracker only while it is genuinely being
  // researched. Finished ones clear: they are on the board like any other
  // question, so keeping them here too would make this an archive of things
  // that already happened.
  const inFlight = nested.filter((q) => q.status === "working");

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

      <div className="rail-block">
        <div className="rail-head">
          live activity
          {open > 0 && (
            <span className="rail-working-tag">
              <span className="alive-think" aria-hidden="true"><i /><i /><i /></span>
              {open} in flight
            </span>
          )}
        </div>
        <div className="rail-feed">
          <Feed events={events} />
        </div>
      </div>

      {/* Nested questions, not a second copy of the question list. The rail
          used to repeat the eight most recent answers, which the board already
          shows in full — so the always-on slot said nothing you could not see by
          scrolling. What is worth keeping in view is the enquiry extending
          itself: an answer audited against the context graph, the graph naming
          what is thin, and each shortfall going off to be researched as a
          question of its own. In flight first, because that is the part that
          changes while you watch. */}
      {/* Only the ones being worked on. A finished nested question clears from
          here and lives on the board with every other question — this slot is a
          tracker, not an archive, so what is in it is what is happening. */}
      <div className="rail-block">
        <div className="rail-head">nested questions</div>
        {inFlight.length === 0 && (
          <div className="rail-empty">
            nothing being worked on — when an answer leaves something thin, the question it
            raises appears here while it is researched
          </div>
        )}
        {inFlight.map((q, i) => {
          const href = `/missions/${q.answered_by}`;
          return (
            <Link
              href={href}
              key={`${q.question}-${i}`}
              className={`rail-item nested working alive-track${path === href ? " on" : ""}`}
            >
              <span className="q">{q.question}</span>
              <span className="s">
                <span className="alive-think" aria-hidden="true"><i /><i /><i /></span>
                {q.raised_by_objective && <span className="from">from: {q.raised_by_objective}</span>}
              </span>
            </Link>
          );
        })}
      </div>

    </aside>
  );
}
