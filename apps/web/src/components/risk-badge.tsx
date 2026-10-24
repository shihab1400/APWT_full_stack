import type { RiskLevel } from "@mindease/shared";

const STYLES: Record<RiskLevel, { label: string; className: string }> = {
  LOW: { label: "Low", className: "bg-primary-soft text-primary" },
  MODERATE: { label: "Moderate", className: "bg-warning-soft text-foreground" },
  HIGH: { label: "High", className: "bg-danger-soft text-danger" },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const style = STYLES[level];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
