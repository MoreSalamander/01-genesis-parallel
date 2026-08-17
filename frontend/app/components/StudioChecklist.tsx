"use client";
/* The studio's production checklist — and what intelligence has covered.

   Convergence Studios is fictional, so its slate is too: the phases below are the
   stages any production goes through, and the ticks are the Studio Head's own,
   kept in this browser. That half is a working document, not a claim.

   The counts are not. Each phase reports how many of the questions actually asked
   mention it, read from the real mission list — so the checklist doubles as a
   coverage map: eleven questions about distribution and none about financing is a
   fact about this studio's attention, and the kind of gap a Studio Head should see
   before the slate moves.

   The two halves are labelled as what they are. A console whose whole argument is
   that every number on it is checkable cannot quietly put a decorative one beside
   them. */

import { useEffect, useState } from "react";
import { MissionSummary } from "@/lib/api";

/* Matching is by mention, and the wording says so — a question is counted for a
   phase when its text names that phase's work. It is a coverage hint, not a
   classifier, and it never claims to be one. */
const PHASES: { key: string; label: string; terms: string[] }[] = [
  { key: "development", label: "Development", terms: ["script", "writer", "story", "ip", "rights", "development", "showrunner", "idea", "concept"] },
  { key: "financing",   label: "Financing",   terms: ["financ", "fund", "invest", "budget", "cost", "raise", "equity", "tax credit", "incentive"] },
  { key: "packaging",   label: "Talent & packaging", terms: ["talent", "cast", "director", "attach", "agency", "represent", "creator", "hire"] },
  { key: "pre",         label: "Pre-production",     terms: ["pre-production", "schedul", "location", "crew", "permit", "prep"] },
  { key: "production",  label: "Production",         terms: ["production", "shoot", "stage", "virtual production", "camera", "set"] },
  { key: "post",        label: "Post & VFX",         terms: ["post", "vfx", "edit", "sound", "colou", "color", "dubbing", "voice"] },
  { key: "distribution",label: "Distribution",       terms: ["distribut", "streamer", "buyer", "sales", "festival", "window", "licens", "deal"] },
  { key: "release",     label: "Marketing & release", terms: ["market", "audience", "release", "campaign", "publicity", "youtube", "channel", "viewer"] },
];

export function StudioChecklist({ missions }: { missions: MissionSummary[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem("genesis.slate.checked");
      if (stored) setDone(JSON.parse(stored));
    } catch { /* private mode — start unticked */ }
  }, []);

  const toggle = (key: string) => {
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("genesis.slate.checked", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const counts = PHASES.map((phase) => {
    const n = missions.filter((m) => {
      const text = m.objective.toLowerCase();
      return phase.terms.some((t) => text.includes(t));
    }).length;
    return { ...phase, n };
  });
  const covered = counts.filter((c) => c.n > 0).length;
  const ticked = counts.filter((c) => done[c.key]).length;

  return (
    <div className="rail-block">
      <div className="rail-head">
        production checklist
        <span className="rail-working-tag">{ticked}/{PHASES.length} done</span>
      </div>

      <ul className="slate">
        {counts.map((phase) => (
          <li key={phase.key} className={done[phase.key] ? "done" : ""}>
            <button
              onClick={() => toggle(phase.key)}
              aria-pressed={Boolean(done[phase.key])}
              title={done[phase.key] ? "Mark as still open" : "Mark this stage done"}
            >
              <span className="box" aria-hidden="true">{done[phase.key] ? "✓" : ""}</span>
              <span className="nm">{phase.label}</span>
              <span className={`asked${phase.n === 0 ? " none" : ""}`}
                    title={phase.n === 0
                      ? "No question asked so far mentions this stage"
                      : `${phase.n} question${phase.n === 1 ? "" : "s"} you have asked mention this stage`}>
                {phase.n === 0 ? "—" : phase.n}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="slate-note">
        The slate is Convergence Studios&apos; own and the ticks are yours, kept in this browser.
        The numbers are not: they count the questions actually asked that mention each stage —
        {" "}<b>{covered} of {PHASES.length}</b> stages have been researched at all.
      </p>
    </div>
  );
}
