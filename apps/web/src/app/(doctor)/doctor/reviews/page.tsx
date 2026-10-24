"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DoctorReviewItem } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { Stars } from "@/components/stars";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { DOCTOR_NAV } from "../nav";

const KEY = ["doctor", "reviews"];

export default function DoctorReviewsPage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Reviews />}</AppShell>;
}

function Reviews() {
  const reviews = useQuery({ queryKey: KEY, queryFn: () => api<DoctorReviewItem[]>("/doctor/reviews") });
  const visible = reviews.data?.filter((r) => r.status !== "HIDDEN") ?? [];
  const average = visible.length ? visible.reduce((t, r) => t + r.rating, 0) / visible.length : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted">
          {average != null
            ? `${average.toFixed(1)} average from ${visible.length} public review${visible.length === 1 ? "" : "s"}. `
            : ""}
          Patients review anonymously. If a review breaks the rules, report it and an admin will
          decide whether to hide it.
        </p>
      </div>
      {reviews.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : reviews.error ? (
        <Alert>{reviews.error.message}</Alert>
      ) : reviews.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No reviews yet.</p>
        </Card>
      ) : (
        reviews.data.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: DoctorReviewItem }) {
  const qc = useQueryClient();
  const report = useMutation({
    mutationFn: (reason: string) =>
      api<DoctorReviewItem>(`/doctor/reviews/${r.id}/report`, { method: "POST", body: { reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <Card className={`flex flex-col gap-2 p-5 ${r.status === "HIDDEN" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Stars rating={r.rating} />
        <span className="text-muted">{formatDateTime(r.createdAt)}</span>
      </div>
      {r.comment && <p className="text-sm leading-6">{r.comment}</p>}
      {r.status === "FLAGGED" && (
        <p className="text-xs text-muted">Reported{r.reportReason ? `: ${r.reportReason}` : ""}. Waiting for an admin.</p>
      )}
      {r.status === "HIDDEN" && <p className="text-xs text-muted">Hidden by an admin. Not shown publicly or counted.</p>}
      {report.error && <Alert>{report.error.message}</Alert>}
      {r.status === "VISIBLE" && (
        <div>
          <ReasonAction
            label="Report"
            confirmLabel="Send report"
            prompt="What's wrong with this review?"
            required
            variant="ghost"
            pending={report.isPending}
            onConfirm={(reason) => report.mutate(reason)}
          />
        </div>
      )}
    </Card>
  );
}
