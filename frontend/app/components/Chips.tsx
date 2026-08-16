import { Elapsed } from "@/lib/alive";

// The state a reader needs, in the words they would use. The machine states
// (VERIFIED / CONFLICTED / UNVERIFIED) stay in the API and the event log where
// they belong; a Studio Head should not have to learn an enum to read a claim.
const VERIFY_CHIP: Record<string, { cls: string; icon: string; label: string; why: string }> = {
  VERIFIED: {
    cls: "verified", icon: "✓", label: "Confirmed",
    why: "More than one independent source said this, so it is treated as solid.",
  },
  CONFLICTED: {
    cls: "conflicted", icon: "⚠", label: "Sources disagree",
    why: "Sources contradicted each other. Both versions are kept — no winner was picked.",
  },
  UNVERIFIED: {
    cls: "unverified", icon: "○", label: "Single source",
    why: "Only one source said this. Useful as a lead, but unconfirmed.",
  },
};

export function VerifyChip({ status }: { status: string }) {
  const chip = VERIFY_CHIP[status] ?? VERIFY_CHIP.UNVERIFIED;
  return <span className={`chip ${chip.cls}`} title={chip.why}>{chip.icon} {chip.label}</span>;
}

const MISSION_CHIP: Record<string, { cls: string; icon: string }> = {
  RECOMMENDED: { cls: "accent", icon: "◆" },
  APPROVED: { cls: "verified", icon: "✓" },
  REJECTED: { cls: "critical", icon: "✕" },
  MORE_RESEARCH_REQUESTED: { cls: "conflicted", icon: "↻" },
  INCOMPLETE: { cls: "critical", icon: "!" },
};

/** `running` adds the active-stage shimmer and an elapsed clock — passed only
 *  when the mission is genuinely in flight (see ACTIVE_STATUSES). */
export function MissionChip({ status, running = false }: { status: string; running?: boolean }) {
  const chip = MISSION_CHIP[status] ?? { cls: "unverified", icon: "…" };
  return (
    <span className={`chip ${chip.cls}${running ? " alive-active" : ""}`}>
      {chip.icon} {status.replaceAll("_", " ")}
      {running && <Elapsed stage={status} running={running} />}
    </span>
  );
}
