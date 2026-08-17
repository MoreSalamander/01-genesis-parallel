"use client";
/* Every question asked, in one list — typed or nested.

   A nested question is a question: the system raised it from its own answer, went
   and researched it, and has an answer for it. So it gets a row here and a page
   of its own, exactly like one you typed. An earlier version tucked them under
   the question that raised them, which made the system's own enquiry read as a
   footnote to yours; where a question came from belongs on its page, not as an
   indent on a list.

   Nothing here is decoration: a row reads "working" only while its mission is
   genuinely in an active status, and the wording of an outcome is the board's
   own — "waiting on your decision" rather than "answered", because §11 puts the
   decision with the Studio Head. */

import Link from "next/link";
import { AskedGroup, MissionSummary, ACTIVE_STATUSES } from "@/lib/api";
import { cascade } from "@/lib/alive";

/* What happened to a question, said the way you would say it. Moved here with
   the board's list; the wording is the board's own. "Waiting on your decision"
   rather than "answered" is load-bearing — a recommendation is not a decision,
   and §11 puts the decision with the Studio Head. */
const OUTCOME: Record<string, { word: string; cls: string }> = {
  APPROVED: { word: "You accepted this", cls: "ok" },
  REJECTED: { word: "You discarded this", cls: "off" },
  MORE_RESEARCH_REQUESTED: { word: "Sent back for more", cls: "busy" },
  RECOMMENDED: { word: "Waiting on your decision", cls: "wait" },
  INCOMPLETE: { word: "Couldn’t finish honestly", cls: "off" },
};

function state(mission: MissionSummary) {
  if (ACTIVE_STATUSES.has(mission.status)) return { word: "Working on it", cls: "busy" };
  return OUTCOME[mission.status] ?? { word: mission.status, cls: "" };
}

export function NestedQuestions({ asked, missions }: {
  asked: AskedGroup[];
  missions: MissionSummary[];
}) {
  // Every question gets its own row, nested or typed. Studio Head's call, said
  // twice: a nested question is a question, so it belongs in this list the way
  // any other does, with its own page. Tucking it under a parent made it a
  // footnote to the question that raised it.
  const roots = asked;
  const nestedTotal = missions.filter((m) => m.raised_by).length;
  const working = missions.filter((m) => m.raised_by && ACTIVE_STATUSES.has(m.status)).length;

  return (
    <ul className="nested-list alive-cascade">
      {roots.map(({ latest: root, times }, i) => {
        const rootState = state(root);
        return (
          <li key={root.id} style={cascade(i)}>
            <Link href={`/missions/${root.id}`} className="answer-row alive-track">
              <span className="q">{root.objective}</span>
              <span className="line">
                <span className={`state ${rootState.cls}`}>{rootState.word}</span>
                <span className="sep">·</span>
                <span>{root.sources} sources read</span>
                {root.verified > 0 && <><span className="sep">·</span><span>{root.verified} confirmed</span></>}
                {root.conflicted > 0 && (
                  <><span className="sep">·</span>
                  <span className="conflict">
                    {root.conflicted} disagreement{root.conflicted === 1 ? "" : "s"} kept
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
      {nestedTotal === 0 && (
        <li className="nested-none muted">
          No nested questions yet. When an answer leaves something thin — a finding resting on
          nothing verified, a company nothing is confirmed about — the shortfall becomes a question
          of its own here, and goes and gets researched.
        </li>
      )}
      {working > 0 && (
        <li className="nested-working">
          {working} nested question{working === 1 ? " is" : "s are"} being worked through right now.
        </li>
      )}
    </ul>
  );
}
