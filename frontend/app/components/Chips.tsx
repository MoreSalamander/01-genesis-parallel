import { Elapsed } from "@/lib/alive";

const VERIFY_CHIP: Record<string, { cls: string; icon: string }> = {
  VERIFIED: { cls: "verified", icon: "✓" },
  CONFLICTED: { cls: "conflicted", icon: "⚠" },
  UNVERIFIED: { cls: "unverified", icon: "○" },
};

export function VerifyChip({ status }: { status: string }) {
  const chip = VERIFY_CHIP[status] ?? VERIFY_CHIP.UNVERIFIED;
  return <span className={`chip ${chip.cls}`}>{chip.icon} {status}</span>;
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
