import type { PaymentItem, PaymentStatus } from "@mindease/shared";

const STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-warning-soft text-foreground" },
  SUCCEEDED: { label: "Paid", className: "bg-primary-soft text-primary" },
  FAILED: { label: "Failed", className: "bg-danger-soft text-danger" },
  REFUND_DUE: { label: "Refund due", className: "bg-warning-soft text-foreground" },
  REFUNDED: { label: "Refunded", className: "bg-border text-muted" },
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const s = STATUS[status];
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

/** "Premium (30 days)" or "Consultation with Dr. X" */
export function paymentLabel(p: Pick<PaymentItem, "purpose" | "doctorName">): string {
  return p.purpose === "SUBSCRIPTION" ? "Premium plan" : `Consultation${p.doctorName ? ` with ${p.doctorName}` : ""}`;
}
