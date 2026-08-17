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
import { useRouter } from "next/navigation";
import { MissionSummary, startMission } from "@/lib/api";

/* Matching is by mention, and the wording says so — a question is counted for a
   phase when its text names that phase's work. It is a coverage hint, not a
   classifier, and it never claims to be one. */
/* Each phase carries a question worth asking about it, written the way a studio
   executive would ask — a real objective, not a keyword. A coverage map that only
   reports a gap leaves the reader to invent the question; this hands it over,
   which matters most for the stage nobody has asked about, because that is
   precisely the stage nobody has the vocabulary for yet. */
const PHASES: { key: string; label: string; terms: string[]; ask: string }[] = [
  { key: "development", label: "Development",
    terms: ["script", "writer", "story", "ip", "rights", "development", "showrunner", "idea", "concept"],
    ask: "Which underlying IP categories are selling to streamers in 2026, and what are they paying for rights?" },
  { key: "financing", label: "Financing",
    terms: ["financ", "fund", "invest", "budget", "cost", "raise", "equity", "tax credit", "incentive"],
    ask: "Which territories offer the most competitive tax incentives for a mid-budget feature in 2026, and what are the qualifying conditions?" },
  { key: "packaging", label: "Talent & packaging",
    terms: ["talent", "cast", "director", "attach", "agency", "represent", "creator", "hire"],
    ask: "Which agencies are packaging AI-native productions, and which directors and showrunners have they attached?" },
  { key: "pre", label: "Pre-production",
    terms: ["pre-production", "schedul", "location", "crew", "permit", "prep"],
    ask: "What does virtual production stage time cost in 2026, and where is capacity actually available?" },
  { key: "production", label: "Production",
    terms: ["production", "shoot", "stage", "virtual production", "camera", "set"],
    ask: "Which studios are running AI pipelines in active production today, and what tools are they using on set?" },
  { key: "post", label: "Post & VFX",
    terms: ["post", "vfx", "edit", "sound", "colou", "color", "dubbing", "voice"],
    ask: "What are current rates and turnaround times for AI-assisted VFX and dubbing, and who is delivering them?" },
  { key: "distribution", label: "Distribution",
    terms: ["distribut", "streamer", "buyer", "sales", "festival", "window", "licens", "deal"],
    ask: "Which buyers acquired independent features in 2026, and on what terms?" },
  { key: "release", label: "Marketing & release",
    terms: ["market", "audience", "release", "campaign", "publicity", "youtube", "channel", "viewer"],
    ask: "What release strategies are working for mid-budget features against streaming windows in 2026?" },
];

export function StudioChecklist({ missions }: { missions: MissionSummary[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const router = useRouter();

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

  const ask = async (question: string) => {
    if (asking) return;
    setAsking(true);
    try {
      const { id } = await startMission(question);
      router.push(`/missions/${id}`);
    } catch { setAsking(false); }
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
          <li key={phase.key} className={`${done[phase.key] ? "done " : ""}${phase.n === 0 ? "uncovered" : ""}`}>
            <div className="slate-row">
              <button className="tick" onClick={() => toggle(phase.key)}
                      aria-pressed={Boolean(done[phase.key])}
                      title={done[phase.key] ? "Mark as still open" : "Mark this stage done"}>
                <span className="box" aria-hidden="true">{done[phase.key] ? "✓" : ""}</span>
              </button>
              <button className="nm" onClick={() => setOpen(open === phase.key ? null : phase.key)}
                      aria-expanded={open === phase.key}
                      title="Show a question worth asking about this stage">
                {phase.label}
              </button>
              <span className={`asked${phase.n === 0 ? " none" : ""}`}
                    title={phase.n === 0
                      ? "No question asked so far mentions this stage"
                      : `${phase.n} question${phase.n === 1 ? "" : "s"} you have asked mention this stage`}>
                {phase.n === 0 ? "—" : phase.n}
              </span>
            </div>
            {open === phase.key && (
              <div className="slate-ask">
                <p>{phase.ask}</p>
                <button disabled={asking} onClick={() => ask(phase.ask)}>
                  {asking ? "opening…" : "ask this →"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="slate-note">
        The slate is Convergence Studios&apos; own and the ticks are yours, kept in this browser.
        The numbers are not: they count the questions actually asked that mention each stage —
        {" "}<b>{covered} of {PHASES.length}</b> stages have been researched at all. Click a stage
        for a question worth asking about it.
      </p>
    </div>
  );
}
