"use client";
/* The research, as objects rather than cards.

   Eight lines of enquiry run at once, and a stack of cards flattens that into a
   list — you cannot see that they are simultaneous. Here each one is a body in
   a shared system: they breathe on the same cycle with staggered phase, so the
   whole thing moves as one organism, and the detail panel opens from whichever
   body you are looking at.

   The motion is ambient and says nothing about work. What *is* claimed is
   claimed honestly: a body pulses only while its line of enquiry has genuinely
   reported nothing yet, and shows its source count the moment it has. Reduced
   motion stills the whole system without hiding anything, and every body is a
   real button so this works from the keyboard and a screen reader. */

import { useState } from "react";
import { EventRecord, MissionDetail } from "@/lib/api";

const DOMAIN_CLASS: Record<string, string> = {
  market: "d-market", talent: "d-talent", industry: "d-industry", strategic: "d-strategic",
};

export function Constellation({ mission, events, running }: {
  mission: MissionDetail;
  events: EventRecord[];
  running: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (mission.tasks.length === 0) return null;

  const found = new Map<string, number>();
  for (const e of events) {
    if (e.event !== "signal.discovered") continue;
    const d = String(e.domain ?? "");
    found.set(d, (found.get(d) ?? 0) + 1);
  }

  const open = mission.tasks.find((t) => t.id === openId) ?? null;
  const openCount = open ? found.get(open.domain) ?? 0 : 0;
  // Size only encodes something when the counts actually differ. Scaling to the
  // max alone made 15-vs-16 sources a 2% difference — noise dressed as signal —
  // so spread across the observed range, and stay uniform when there is none.
  const counts = mission.tasks.map((t) => found.get(t.domain) ?? 0);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const spread = hi - lo;
  const meaningful = hi > 0 && spread / hi >= 0.25;

  return (
    <div className="constellation">
      <div className="bodies" role="list">
        {mission.tasks.map((task, i) => {
          const count = found.get(task.domain) ?? 0;
          const working = running && count === 0;
          // Size carries how much this line of enquiry actually returned.
          const scale = meaningful ? 0.68 + 0.32 * ((count - lo) / spread) : 1;
          return (
            <button
              key={task.id}
              role="listitem"
              className={`body ${DOMAIN_CLASS[task.domain] ?? ""}`
                + (working ? " working" : "")
                + (openId === task.id ? " open" : "")}
              style={{ "--i": i, "--scale": scale } as React.CSSProperties}
              onMouseEnter={() => setOpenId(task.id)}
              onFocus={() => setOpenId(task.id)}
              onClick={() => setOpenId(openId === task.id ? null : task.id)}
              aria-expanded={openId === task.id}
              aria-label={`${task.domain}: ${task.focus}. ${
                working ? "still searching" : `${count} sources found`}`}
            >
              <span className="orb" aria-hidden="true" />
              <span className="label">{task.domain}</span>
              <span className="count">{working ? "···" : count}</span>
            </button>
          );
        })}
      </div>

      {/* The screen that pops out of whichever body you are on. */}
      <div className={`readout${open ? " shown" : ""}`} aria-live="polite">
        {open ? (
          <>
            <div className="readout-head">
              <span className={`tag ${DOMAIN_CLASS[open.domain] ?? ""}`}>{open.domain}</span>
              <span className="n">
                {running && openCount === 0 ? "searching…" : `${openCount} sources`}
              </span>
            </div>
            <p className="focus">{open.focus}</p>
            {open.queries.length > 0 && (
              <ul className="queries">
                {open.queries.slice(0, 3).map((q) => <li key={q}>{q}</li>)}
              </ul>
            )}
          </>
        ) : (
          <p className="hint">
            {running
              ? "Each body is one line of enquiry, running right now. Hover one to see what it is chasing."
              : "Hover a body to see what that line of enquiry was chasing, and what it found."}
          </p>
        )}
      </div>
    </div>
  );
}
