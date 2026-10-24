"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { REVIEW_COMMENT_MAX, type AppointmentItem, type PublicReview, type ReviewDto } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Outcome, ReasonAction, StatusBadge, When } from "@/components/appointment-parts";
import { formatBdt } from "@/components/doctor-card";
import { PaymentBadge } from "@/components/payment-parts";
import { StarInput, Stars } from "@/components/stars";
import { Alert, Button, ButtonLink, Card, TextArea } from "@/components/ui";
import { api } from "@/lib/api";
import { useNow } from "@/lib/use-now";
import { USER_NAV } from "../nav";

const appointmentsKey = ["appointments", "mine"];

export default function AppointmentsPage() {
  return <AppShell role="USER" nav={USER_NAV}>{() => <Appointments />}</AppShell>;
}

function Appointments() {
  const list = useQuery({
    queryKey: appointmentsKey,
    queryFn: () => api<AppointmentItem[]>("/appointments"),
  });

  const now = useNow();
  const isUpcoming = (a: AppointmentItem) =>
    ["PENDING_PAYMENT", "REQUESTED", "ACCEPTED"].includes(a.status) && new Date(a.endsAt).getTime() > now;
  // The API returns newest first; upcoming reads best soonest first.
  const upcoming = list.data?.filter(isUpcoming).reverse() ?? [];
  const past = list.data?.filter((a) => !isUpcoming(a)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="text-sm text-muted">All times are Bangladesh time.</p>
        </div>
        <ButtonLink href="/doctors">Book a doctor</ButtonLink>
      </div>

      {list.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : list.error ? (
        <Alert>{list.error.message}</Alert>
      ) : (
        <>
          <section aria-labelledby="upcoming" className="flex flex-col gap-3">
            <h2 id="upcoming" className="text-lg font-semibold">
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">
                  No upcoming appointments.{" "}
                  <Link href="/doctors" className="text-primary hover:underline">
                    Find a doctor
                  </Link>{" "}
                  to book an online or in-person session.
                </p>
              </Card>
            ) : (
              upcoming.map((a) => (
                <AppointmentCard key={a.id} appointment={a} canCancel={a.status !== "PENDING_PAYMENT"} />
              ))
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past" className="flex flex-col gap-3">
              <h2 id="past" className="text-lg font-semibold">
                Past and cancelled
              </h2>
              {past.map((a) => (
                <AppointmentCard key={a.id} appointment={a} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AppointmentCard({ appointment: a, canCancel }: { appointment: AppointmentItem; canCancel?: boolean }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api<AppointmentItem>(`/appointments/${a.id}/cancel`, {
        method: "POST",
        body: { reason: reason || undefined },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/doctors/${a.doctor.id}`} className="font-medium hover:underline">
            {a.doctor.name}
          </Link>
          <p className="text-sm text-muted">
            {a.doctor.specialization ?? "Mental health professional"} · {formatBdt(a.doctor.fee)}
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>
      <When appointment={a} />
      {a.type === "OFFLINE" && a.doctor.clinicAddress && (
        <p className="text-sm text-muted">Address: {a.doctor.clinicAddress}</p>
      )}
      {a.patientNote && <p className="text-sm text-muted">Your note: {a.patientNote}</p>}
      {a.payment && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Payment {formatBdt(a.payment.amount)} <PaymentBadge status={a.payment.status} />
          {a.payment.status === "REFUND_DUE" && "Full refund on its way."}
        </p>
      )}
      {a.status === "PENDING_PAYMENT" && (
        <p className="text-sm text-muted">
          Waiting for your payment to be confirmed. If it isn&apos;t completed, the time is
          released automatically.
        </p>
      )}
      <Outcome appointment={a} />
      {a.type === "ONLINE" && (a.status === "ACCEPTED" || a.status === "COMPLETED") && (
        <ButtonLink href={`/dashboard/messages?appointment=${a.id}`} variant="secondary" className="w-fit">
          {a.status === "ACCEPTED" ? "Open chat" : "View chat history"}
        </ButtonLink>
      )}
      {["REQUESTED", "ACCEPTED", "COMPLETED"].includes(a.status) && <ShareToggle appointment={a} />}
      {a.status === "COMPLETED" && <Rating appointment={a} />}
      {cancel.error && <Alert>{cancel.error.message}</Alert>}
      {canCancel && (
        <div>
          <ReasonAction
            label="Cancel appointment"
            confirmLabel="Cancel appointment"
            prompt="Reason for cancelling (optional). Any payment is refunded in full."
            variant="ghost"
            pending={cancel.isPending}
            onConfirm={(reason) => cancel.mutate(reason)}
          />
        </div>
      )}
    </Card>
  );
}

function ShareToggle({ appointment: a }: { appointment: AppointmentItem }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (share: boolean) =>
      api<AppointmentItem>(`/appointments/${a.id}/sharing`, { method: "PATCH", body: { share } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={a.shareAssessments}
        disabled={toggle.isPending}
        onChange={(e) => toggle.mutate(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      Share my self-assessment results with {a.doctor.name}
    </label>
  );
}

/** "Rate doctor" for a completed session; shown once, then replaced by the given rating. */
function Rating({ appointment: a }: { appointment: AppointmentItem }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const submit = useMutation({
    mutationFn: (dto: ReviewDto) =>
      api<PublicReview>(`/appointments/${a.id}/review`, { method: "POST", body: dto }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  if (submit.isSuccess) {
    return (
      <p role="status" className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
        Thank you for your feedback. It helps other patients choose the right doctor.
      </p>
    );
  }
  if (a.review) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        Your rating: <Stars rating={a.review.rating} />
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
        Rate doctor
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) submit.mutate({ rating, comment: comment.trim() || undefined });
      }}
    >
      <p className="text-sm font-medium">How was your session with {a.doctor.name}?</p>
      <StarInput value={rating} onChange={setRating} />
      <TextArea
        id={`review-${a.id}`}
        label="Comment (optional)"
        hint="Shown on the doctor's profile as “Verified patient”, without your name."
        rows={3}
        maxLength={REVIEW_COMMENT_MAX}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {submit.error && <Alert>{submit.error.message}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!rating || submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </form>
  );
}
