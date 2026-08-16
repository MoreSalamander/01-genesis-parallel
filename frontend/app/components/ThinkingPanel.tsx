"use client";
/* What the system is doing, while it does it.

   A mission plans several research tasks and runs them across four cognitive
   domains, discovering sources one at a time — but the console used to show a
   single status word for all of it, so the most convincing thing this system
   does happened invisibly. Everything below is read from the mission document
   and the agent event stream: the tasks are the ones the planner actually
   wrote, and a domain only reports sources it actually discovered. Nothing here
   animates work that isn't happening. */

import { EventRecord, MissionDetail } from "@/lib/api";
import { Rolling, cascade } from "@/lib/alive";

const DOMAIN_LABEL: Record<string, string> = {
  market: "market", talent: "talent", industry: "industry", strategic: "strategic",
};

export function ThinkingPanel({ mission, events, running }: {
  mission: MissionDetail;
  events: EventRecord[];
  running: boolean;
}) {
  if (mission.tasks.length === 0) return null;

  // Sources discovered per domain, counted from the events the agents emitted.
  const found = new Map<string, number>();
  const discovered: { title: string; domain: string }[] = [];
  for (const e of events) {
    if (e.event !== "signal.discovered") continue;
    const domain = String(e.domain ?? "");
    found.set(domain, (found.get(domain) ?? 0) + 1);
    discovered.push({ title: String(e.title ?? ""), domain });
  }

  const claimsMade = events.filter(
    (e) => e.event === "claim.verified" || e.event === "claim.conflicted",
  ).length;

  return (
    <section className={`panel thinking ${running ? "live" : ""}`}>
      <h2>
        {running ? "What I'm doing" : "How I answered this"}
        <span className="muted">
          {" · "}I split the question into {mission.tasks.length} lines of enquiry and chased them at once
        </span>
      </h2>

      <ul className="tasks alive-cascade">
        {mission.tasks.map((task, i) => {
          const count = found.get(task.domain) ?? 0;
          // "working" only where the mission is genuinely in flight and this
          // domain has not reported yet — never a spinner over finished work.
          const working = running && count === 0;
          return (
            <li className={`task${working ? " working" : ""}`} key={task.id} style={cascade(i)}>
              <span className="domain">{DOMAIN_LABEL[task.domain] ?? task.domain}</span>
              <span className="focus">{task.focus}</span>
              <span className="found">
                {working
                  ? <span className="alive-think" aria-hidden="true"><i /><i /><i /></span>
                  : count > 0 ? `${count} sources` : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="thinking-tally">
        <span><Rolling value={discovered.length} /> sources read</span>
        <span><Rolling value={claimsMade} /> statements checked against each other</span>
        {running && <span className="still">still reading…</span>}
      </div>

      {discovered.length > 0 && (
        <div className="found-feed alive-cascade">
          {discovered.slice(-6).reverse().map((d, i) => (
            <div className="found-row" key={`${d.title}-${i}`} style={cascade(i)}>
              <span className="tag">{DOMAIN_LABEL[d.domain] ?? d.domain}</span>
              <span className="t">{d.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
