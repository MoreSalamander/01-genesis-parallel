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

export function MissionChip({ status }: { status: string }) {
  const chip = MISSION_CHIP[status] ?? { cls: "unverified", icon: "…" };
  return <span className={`chip ${chip.cls}`}>{chip.icon} {status.replaceAll("_", " ")}</span>;
}
