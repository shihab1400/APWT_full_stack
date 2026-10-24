"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AdminReviewItem, ModerateReviewDto, ReviewStatus } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { Stars } from "@/components/stars";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

const TABS: { label: string; status?: ReviewStatus }[] = [
  { label: "Reported", status: "FLAGGED" },
  { label: "Visible", status: "VISIBLE" },
  { label: "Hidden", status: "HIDDEN" },
  { label: "All" },
];

const BADGE: Record<ReviewStatus, string> = {
  VISIBLE: "bg-primary-soft text-primary",
  FLAGGED: "bg-warning-soft text-foreground",
  HIDDEN: "bg-border text-muted",
};

export default function AdminReviewsPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Queue />}</AppShell>;
}

function Queue() {
  const [tab, setTab] = useState(0);
  const status = TABS[tab].status;
  const reviews = useQuery({
    queryKey: ["admin", "reviews", status ?? "ALL"],
    queryFn: () => api<AdminReviewItem[]>(`/admin/reviews${status ? `?status=${status}` : ""}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Review moderation</h1>
        <p className="text-sm text-muted">
          Hide reviews that break the terms (personal details, abuse, spam). Flag ones you want to keep
          an eye on. Hidden reviews don&apos;t count toward a doctor&apos;s rating.
        </p>
      </div>
      <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tab === i ? "bg-primary-soft font-medium text-primary" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {reviews.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : reviews.error ? (
        <Alert>{reviews.error.message}</Alert>
      ) : reviews.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Nothing here.</p>
        </Card>
      ) : (
        reviews.data.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: AdminReviewItem }) {
  const qc = useQueryClient();
  const moderate = useMutation({
    mutationFn: (dto: ModerateReviewDto) => api(`/admin/reviews/${r.id}`, { method: "PATCH", body: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reviews"] }),
  });
  const actions: { status: ReviewStatus; label: string }[] = [
    { status: "HIDDEN" as const, label: "Hide" },
    { status: "FLAGGED" as const, label: "Flag" },
    { status: "VISIBLE" as const, label: r.status === "HIDDEN" ? "Restore" : "Keep visible" },
  ].filter((a) => a.status !== r.status);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <Stars rating={r.rating} />{" "}
          <span className="text-muted">
            for <strong className="text-foreground">{r.doctor.name}</strong> by {r.patient.name} ({r.patient.email}) ·{" "}
            {formatDateTime(r.createdAt)}
          </span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>{r.status.toLowerCase()}</span>
      </div>
      {r.comment ? <p className="text-sm leading-6">{r.comment}</p> : <p className="text-sm text-muted">(No comment)</p>}
      {r.reportReason && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
          <span className="text-muted">Reported by the doctor: </span>
          {r.reportReason}
        </p>
      )}
      {moderate.error && <Alert>{moderate.error.message}</Alert>}
      <div className="flex flex-wrap items-start gap-2">
        {actions.map((a) => (
          <ReasonAction
            key={a.status}
            label={a.label}
            confirmLabel={a.label}
            prompt="Reason (logged)"
            required
            variant={a.status === "HIDDEN" ? "secondary" : "ghost"}
            pending={moderate.isPending}
            onConfirm={(reason) => moderate.mutate({ status: a.status, reason })}
          />
        ))}
      </div>
    </Card>
  );
}
