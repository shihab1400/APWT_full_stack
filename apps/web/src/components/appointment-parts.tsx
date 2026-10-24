"use client";

import { useId, useState } from "react";
import {
  APPOINTMENT_TYPE_LABEL,
  type AppointmentItem,
  type AppointmentStatus,
} from "@mindease/shared";
import { Button } from "@/components/ui";
import { formatLongDay, formatTime } from "@/lib/datetime";

const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", className: "bg-warning-soft text-foreground" },
  REQUESTED: { label: "Awaiting doctor", className: "bg-warning-soft text-foreground" },
  ACCEPTED: { label: "Confirmed", className: "bg-primary-soft text-primary" },
  DECLINED: { label: "Declined", className: "bg-danger-soft text-danger" },
  CANCELLED: { label: "Cancelled", className: "bg-border text-muted" },
  COMPLETED: { label: "Completed", className: "bg-primary-soft text-primary" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = STATUS[status];
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

/** "Monday 27 October · 11:00 am – 12:00 pm · Online (text chat)" */
export function When({ appointment: a }: { appointment: AppointmentItem }) {
  return (
    <p className="text-sm">
      <strong>{formatLongDay(a.startsAt)}</strong> · {formatTime(a.startsAt)} – {formatTime(a.endsAt)}{" "}
      · <span className="text-muted">{APPOINTMENT_TYPE_LABEL[a.type]}</span>
    </p>
  );
}

/** Why an appointment didn't go ahead, if it didn't. */
export function Outcome({ appointment: a }: { appointment: AppointmentItem }) {
  if (a.status === "DECLINED" && a.declineReason) {
    return <p className="text-sm text-muted">Declined: {a.declineReason}</p>;
  }
  if (a.status === "CANCELLED") {
    const by = { PATIENT: "the patient", DOCTOR: "the doctor", SYSTEM: "MindEase" }[a.cancelledBy ?? "SYSTEM"];
    return (
      <p className="text-sm text-muted">
        Cancelled by {by}
        {a.cancelReason ? `: ${a.cancelReason}` : ""}
      </p>
    );
  }
  return null;
}

/**
 * A button that expands into a short form asking for a reason, used for
 * declining or cancelling. `required` reasons must be at least 3 characters.
 */
export function ReasonAction({
  label,
  confirmLabel,
  prompt,
  required = false,
  pending,
  onConfirm,
  variant = "secondary",
}: {
  label: string;
  confirmLabel: string;
  prompt: string;
  required?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  variant?: "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const id = useId();

  if (!open) {
    return (
      <Button variant={variant} onClick={() => setOpen(true)} disabled={pending}>
        {label}
      </Button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = reason.trim();
        if (required && value.length < 3) return setError("Please give a reason");
        onConfirm(value);
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {prompt}
      </label>
      <textarea
        id={id}
        rows={2}
        value={reason}
        maxLength={500}
        autoFocus
        onChange={(e) => {
          setReason(e.target.value);
          setError(undefined);
        }}
        aria-invalid={!!error}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </form>
  );
}
