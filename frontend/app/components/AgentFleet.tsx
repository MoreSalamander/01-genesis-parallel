"use client";
/* The room, while it works.

   The console could already show what the work was doing — lines of enquiry,
   domains, sources arriving — but never who was doing it. The planner names a
   specialist for every task and the API has always carried it; nothing rendered
   it, so nested cognition (§2) and separation of duties (§13) happened off
   screen.

   Two claims are made here and both are checkable. Who was called up comes from
   mission.tasks, written by the planner. What each one returned is counted from
   the evidence.created events that carry `specialist` — so a card showing four
   is showing four the agent actually produced. A specialist an objective did
   not call for is drawn dormant rather than hidden, because "only the roles the
   objective requires are instantiated" is the locked principle, and it can only
   be read off a roster that shows the ones standing down. */

import { useEffect, useState } from "react";
import { AgentRoster, EventRecord, MissionDetail, getAgents } from "@/lib/api";

const DOMAIN_CLASS: Record<string, string> = {
  market: "d-market", talent: "d-talent", industry: "d-industry", strategic: "d-strategic",
};

/* A standing role has acted once its stage is in the mission's record. The
   stage names are the ones the executive writes (app/agents/executive). */
const STAGE_DONE: Record<string, string[]> = {
  "Research Planner": ["PLANNED"],
  "Verification Agent": ["VERIFIED"],
  "Strategic Cognition": ["ASSESSED"],
  "Executive Agent": ["MISSION ACCEPTED"],
};

export function AgentFleet({ mission, events, running }: {
  mission: MissionDetail;
  events: EventRecord[];
  running: boolean;
}) {
  const [roster, setRoster] = useState<AgentRoster | null>(null);

  useEffect(() => {
    getAgents().then(setRoster).catch(() => setRoster(null));
  }, []);

  if (!roster || mission.tasks.length === 0) return null;

  // What each named agent actually returned, from its own events.
  const yieldBy = new Map<string, number>();
  for (const e of events) {
    if (e.event !== "evidence.created") continue;
    const who = String(e.specialist ?? "");
    if (who) yieldBy.set(who, (yieldBy.get(who) ?? 0) + Number(e.count ?? 0));
  }

  // Called up for this objective, with the focus the planner gave them — which
  // is specific to this question, unlike the role's standing focus.
  const assigned = new Map<string, string[]>();
  for (const task of mission.tasks) {
    if (!assigned.has(task.specialist)) assigned.set(task.specialist, []);
    assigned.get(task.specialist)!.push(task.focus);
  }

  const stages = new Set(mission.stages.map((s) => s.name));
  const calledUp = roster.domains.reduce(
    (n, d) => n + d.specialists.filter((s) => assigned.has(s.name)).length, 0);
  const total = roster.domains.reduce((n, d) => n + d.specialists.length, 0);

  // The deepen loop hires a researcher that is not on the standing roster.
  const followUp = yieldBy.get("follow-up researcher") ?? 0;

  return (
    <section className={`panel fleet ${running ? "live" : ""}`}>
      <h2>
        {running ? "Who's working on this" : "Who worked on this"}
        <span className="muted">
          {" · "}{calledUp} of {total} specialists called up for this question, and the {roster.standing.length} roles
          that run every one
        </span>
      </h2>

      <div className="fleet-standing">
        {roster.standing.map((agent) => {
          const done = (STAGE_DONE[agent.name] ?? []).some((s) => stages.has(s));
          const active = running && !done;
          return (
            <div key={agent.name} className={`agent standing${done ? " done" : ""}${active ? " active" : ""}`}>
              <div className="agent-head">
                <span className="agent-name">{agent.name}</span>
                <span className="agent-state">{done ? "done" : active ? "working" : "waiting"}</span>
              </div>
              <p className="agent-role">{agent.role}</p>
              <div className="perms">
                {agent.permissions.map((p) => <span key={p} className="perm">{p}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="fleet-domains">
        {roster.domains.map((domain) => (
          <div key={domain.domain} className={`fleet-domain ${DOMAIN_CLASS[domain.domain] ?? ""}`}>
            <div className="domain-head">
              <span className="dot" aria-hidden="true" />
              {domain.domain}
            </div>
            {domain.specialists.map((spec) => {
              const focuses = assigned.get(spec.name);
              const produced = yieldBy.get(spec.name) ?? 0;
              return (
                <div key={spec.name} className={`agent${focuses ? "" : " dormant"}`}>
                  <div className="agent-head">
                    <span className="agent-name">{spec.name}</span>
                    {focuses ? (
                      <span className="agent-state">
                        {produced > 0
                          ? `${produced} quote${produced === 1 ? "" : "s"}`
                          : running ? "reading…" : "nothing found"}
                      </span>
                    ) : (
                      <span className="agent-state dim">not needed</span>
                    )}
                  </div>
                  <p className="agent-role">{focuses ? focuses[0] : spec.focus}</p>
                  {/* One specialist often takes more than one line of enquiry.
                      Showing the first and silently dropping the rest would
                      undercount the work on screen. */}
                  {focuses && focuses.length > 1 && (
                    <p className="agent-more" title={focuses.slice(1).join(" · ")}>
                      + {focuses.length - 1} more line{focuses.length === 2 ? "" : "s"} of enquiry
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {followUp > 0 && (
        <p className="fleet-note">
          A <b>follow-up researcher</b> was brought in after the first answer fell short of the
          question, and returned {followUp} further quote{followUp === 1 ? "" : "s"}.
        </p>
      )}
      <p className="fleet-note muted">
        Specialists are roles, not running processes — only the ones this question needed were
        instantiated. The rest are shown so you can see what was available and stood down.
      </p>
    </section>
  );
}
