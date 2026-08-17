"use client";
/* The persistent rail — the studio's vitals, always on screen.

   The console used to be a single scrolling document, which is why it read as
   a report rather than something running. The rail keeps what the studio knows
   in view no matter where you are: what it has looked at, what held up, and
   what it refuses to resolve. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ACTIVE_STATUSES, EventRecord, MissionSummary, getEvents, listMissions } from "@/lib/api";
import { Feed } from "./Hud";
import { StudioChecklist } from "./StudioChecklist";
import { Rolling } from "@/lib/alive";

export function Rail() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const path = usePathname();

  useEffect(() => {
    const load = () => {
      listMissions().then(setMissions).catch(() => {});
      // Read from the graph, not from missions carrying raised_by: a question is
      // recorded when it is raised, and only some are dispatched as missions.
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

  /* What the rail is for: the things waiting on the Studio Head.

     A progress indicator was the wrong job for this slot — live activity already
     says how many questions are in flight, right above. What is genuinely easy to
     miss is a finished answer waiting on a decision, and most of all a nested
     question's answer, because nobody typed that question and so nobody is
     watching for it. §11 puts the decision with the Studio Head; this is the
     queue that boundary implies.

     Nested questions are why the block exists but not all of it: a queue that
     omitted the question you typed yourself would be a strange kind of queue. The
     ones the system raised are marked. */
  const awaiting = missions
    .filter((m) => m.status === "RECOMMENDED")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

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
      {/* Gone, not empty. A queue with nothing in it should take no room: a
          permanent header over a paragraph explaining its own emptiness never
          stops saying nothing, and the rail is short and sticky, so anything on it
          that is not currently true costs the things that are. */}
      {awaiting.length > 0 && (
        <div className="rail-block">
          <div className="rail-head">
            needs approval
            <span className="rail-working-tag">{awaiting.length} waiting</span>
          </div>
          {awaiting.map((m) => (
            <Link
              href={`/missions/${m.id}`}
              key={m.id}
              className={`rail-item awaiting alive-track${path === `/missions/${m.id}` ? " on" : ""}`}
            >
              <span className="q">{m.objective}</span>
              <span className="s">
                {m.raised_by
                  ? <span className="from">it asked itself · {m.sources} sources</span>
                  : <span className="from">you asked · {m.sources} sources</span>}
                <span className="counts">
                  {m.verified} confirmed
                  {m.conflicted > 0 && <span className="conflict"> · {m.conflicted} disputed</span>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <StudioChecklist missions={missions} />
    </aside>
  );
}
