"use client";
/* The crew, as bodies on the board.

   The mission page shows who worked on one question. This is the standing
   fleet: every line of enquiry and every agent as a sphere, carrying what it
   has done across every mission ever run. Size is the tally — an agent that has
   pulled six hundred quotes is visibly a bigger body than one that has pulled
   twelve — so the shape of the crew is legible before a single number is read.

   Every figure comes from /api/fleet, counted over the whole event log and the
   planner's own tasks. Nothing is estimated and nothing animates work that is
   not happening: a sphere breathes only while a mission is actually running,
   and a role that has never been called sits dark rather than being hidden. */

import { useEffect, useState } from "react";
import { FleetTally, getFleet } from "@/lib/api";
import { Rolling, useReducedMotion } from "@/lib/alive";

const DOMAIN_CLASS: Record<string, string> = {
  market: "d-market", talent: "d-talent", industry: "d-industry", strategic: "d-strategic",
};

export function FleetSpheres({ running }: { running: boolean }) {
  const [fleet, setFleet] = useState<FleetTally | null>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const load = () => { getFleet().then(setFleet).catch(() => {}); };
    load();
    const timer = setInterval(load, running ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [running]);

  if (!fleet) return null;

  const bodies = fleet.domains.flatMap((d) =>
    d.specialists.map((s) => ({ ...s, domain: d.domain })));
  const peak = Math.max(1, ...bodies.map((b) => b.produced));

  return (
    <section className={`panel fleet-board${running ? " live" : ""}`}>
      <h2>
        The crew
        <span className="muted">
          {" · "}{fleet.totals.tasks} lines of enquiry run across {fleet.totals.missions} question
          {fleet.totals.missions === 1 ? "" : "s"}
          {fleet.totals.raised > 0 && `, ${fleet.totals.raised} of which it raised for itself`}
        </span>
      </h2>

      <div className="fleet-tally">
        <span><b><Rolling value={fleet.totals.tasks} /></b> tasks done</span>
        <span><b><Rolling value={fleet.totals.sources} /></b> sources read</span>
        <span><b><Rolling value={fleet.totals.produced} /></b> quotes pulled</span>
      </div>

      <div className="fleet-domains-flow">
      {fleet.domains.map((domain) => (
        <div key={domain.domain} className={`enquiry-line ${DOMAIN_CLASS[domain.domain] ?? ""}`}>
          <div className="enquiry-head" title={`${domain.tasks} tasks · ${domain.sources} sources`}>
            <span className="dot" aria-hidden="true" />
            <span className="nm">{domain.domain}</span>
            <span className="n">{domain.tasks}·{domain.sources}</span>
          </div>
          <div className="spheres" role="list">
            {domain.specialists.map((spec, i) => {
              const worked = spec.produced > 0 || spec.tasks > 0;
              // Area, not diameter: doubling the number should look like twice
              // as much, and a radius-linear scale exaggerates the big ones.
              const scale = worked ? 0.5 + 0.5 * Math.sqrt(spec.produced / peak) : 0.34;
              return (
                <div
                  key={spec.name}
                  role="listitem"
                  className={`sphere${worked ? "" : " idle"}${running && !still ? " breathing" : ""}`}
                  style={{ "--i": i, "--scale": scale } as React.CSSProperties}
                  title={`${spec.name} — ${spec.focus}`}
                >
                  <span className="orb" aria-hidden="true" />
                  <span className="sphere-name">{spec.name.replace(/ Agent$/, "")}</span>
                  <span className="sphere-n">
                    {worked ? `${spec.tasks}·${spec.produced}` : "not yet called"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </div>

      <p className="fleet-foot muted">
        Each sphere is one role, sized by what it returned; a dark one has never been needed.
        {fleet.follow_up.produced > 0 && (
          <> A nested-question researcher adds {fleet.follow_up.produced} quotes over
          {" "}{fleet.follow_up.tasks} round{fleet.follow_up.tasks === 1 ? "" : "s"}.</>
        )}
      </p>
    </section>
  );
}
