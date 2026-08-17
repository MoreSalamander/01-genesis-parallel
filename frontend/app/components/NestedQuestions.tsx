"use client";
/* Nested questions: the answers, and the questions those answers raised.

   This replaces a flat list of everything asked, which said no more than the
   ask box already implied. What is worth watching is the nesting — an answer
   gets audited against the context graph, the graph names what is thin, and each
   shortfall becomes a question of its own that goes and gets researched. That is
   the system extending its own enquiry, and it happened invisibly on a list that
   treated every row as unrelated.

   So a question you asked is a root, and the questions it raised sit under it,
   live, with what each one is doing right now. Nothing here is decoration: a row
   reads "working" only while its mission is genuinely in an active status, and a
   root with no nested questions says so rather than implying more is coming. */

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
  // Depth is one by design — a nested question does not nest again, because
  // every node of that tree spends real metered retrieval.
  const nestedBy = new Map<string, MissionSummary[]>();
  for (const mission of missions) {
    if (!mission.raised_by) continue;
    const list = nestedBy.get(mission.raised_by);
    if (list) list.push(mission);
    else nestedBy.set(mission.raised_by, [mission]);
  }

  // Only roots here: a nested question appears under the answer that raised it,
  // not a second time at the top.
  const roots = asked.filter((group) => !group.latest.raised_by);
  const nestedTotal = [...nestedBy.values()].reduce((n, list) => n + list.length, 0);
  const working = missions.filter((m) => m.raised_by && ACTIVE_STATUSES.has(m.status)).length;

  return (
    <ul className="nested-list alive-cascade">
      {roots.map(({ latest: root, times }, i) => {
        const nested = nestedBy.get(root.id) ?? [];
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

            {nested.length > 0 && (
              <ul className="nested-children">
                {nested.map((child) => {
                  const childState = state(child);
                  return (
                    <li key={child.id}>
                      <Link href={`/missions/${child.id}`} className="nested-row alive-track">
                        <span className="branch" aria-hidden="true" />
                        <span className="q">{child.objective}</span>
                        <span className="line">
                          <span className={`state ${childState.cls}`}>{childState.word}</span>
                          {child.sources > 0 && (
                            <><span className="sep">·</span><span>{child.sources} sources</span></>
                          )}
                          {child.verified > 0 && (
                            <><span className="sep">·</span><span>{child.verified} confirmed</span></>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
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
