"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  APPOINTMENT_TYPE_LABEL,
  BOOKING_WINDOW_DAYS,
  PAYMENT_HOLD_MINUTES,
  SLOT_UNAVAILABLE,
  type AppointmentType,
  type AuthUser,
  type BookAppointmentDto,
  type BookingCheckout,
  type DoctorSlots,
  type PublicDoctor,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Rating, formatBdt } from "@/components/doctor-card";
import { Alert, Button, Card, TextArea } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDay, formatLongDay, formatTime, groupByDay } from "@/lib/datetime";
import { USER_NAV } from "../../nav";

export function BookSession() {
  const { doctorId } = useParams<{ doctorId: string }>();
  return (
    <AppShell role="USER" nav={USER_NAV}>
      {(user) => <Booking doctorId={doctorId} user={user} />}
    </AppShell>
  );
}

function Booking({ doctorId, user }: { doctorId: string; user: AuthUser }) {
  const qc = useQueryClient();
  const doctor = useQuery({
    queryKey: ["doctors", doctorId],
    queryFn: () => api<PublicDoctor>(`/doctors/${doctorId}`),
  });
  const slots = useQuery({
    queryKey: ["doctors", doctorId, "slots"],
    queryFn: () => api<DoctorSlots>(`/doctors/${doctorId}/slots`),
  });

  const [day, setDay] = useState<string>();
  const [startsAt, setStartsAt] = useState<string>();
  const [type, setType] = useState<AppointmentType>("ONLINE");
  const [note, setNote] = useState("");
  const [share, setShare] = useState(true);

  const book = useMutation({
    mutationFn: (dto: BookAppointmentDto) =>
      api<BookingCheckout>("/appointments", { method: "POST", body: dto }),
    onSuccess: (checkout) => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      // Off to the payment gateway; it sends the browser back to our result page.
      window.location.assign(checkout.checkoutUrl);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.body.code === SLOT_UNAVAILABLE) {
        setStartsAt(undefined);
        void slots.refetch();
      }
    },
  });

  if (doctor.isPending || slots.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (doctor.error) return <Alert>{doctor.error.message}</Alert>;
  if (slots.error) return <Alert>{slots.error.message}</Alert>;

  if (book.data) {
    return (
      <Card className="mx-auto max-w-xl" role="status">
        <p className="font-medium">Taking you to payment…</p>
        <p className="mt-1 text-sm text-muted">
          Your time is held for {PAYMENT_HOLD_MINUTES} minutes while you pay.
        </p>
      </Card>
    );
  }

  const days = groupByDay(slots.data.slots, (s) => s.startsAt);
  const selectedDay = day ?? days[0]?.[0];
  const times = days.find(([key]) => key === selectedDay)?.[1] ?? [];
  const offersInPerson = !!slots.data.clinicAddress;
  const premium = user.tier === "PAID";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href={`/doctors/${doctorId}`} className="text-sm text-primary hover:underline">
        ← Doctor profile
      </Link>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Book {doctor.data.name}</h1>
          <p className="text-muted">{doctor.data.specialization ?? "Mental health professional"}</p>
          <Rating doctor={doctor.data} />
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">Fee per session</p>
          <p className="text-xl font-semibold">{formatBdt(doctor.data.fee)}</p>
        </div>
      </Card>

      {!premium && (
        <Alert tone="info">
          Booking a doctor is part of Premium.{" "}
          <Link href="/dashboard/billing" className="font-medium underline">
            See Premium
          </Link>{" "}
          to book this session. You can still look at the open times below.
        </Alert>
      )}

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (startsAt) {
            book.mutate({ doctorId, startsAt, type, note: note.trim() || undefined, shareAssessments: share });
          }
        }}
      >
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">1. Choose a time</h2>
            <p className="text-sm text-muted">
              Open slots for the next {BOOKING_WINDOW_DAYS} days, in Bangladesh time. Each session
              is one hour.
            </p>
          </div>
          {days.length === 0 ? (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
              No open slots in the next {BOOKING_WINDOW_DAYS} days. Please check back later or
              choose another doctor.
            </p>
          ) : (
            <>
              <div role="group" aria-label="Day" className="flex gap-2 overflow-x-auto pb-1">
                {days.map(([key, daySlots]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={key === selectedDay}
                    onClick={() => {
                      setDay(key);
                      setStartsAt(undefined);
                    }}
                    className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm transition-colors ${
                      key === selectedDay
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    <span className="font-medium">{formatDay(daySlots[0].startsAt)}</span>
                    <span className="text-xs text-muted">
                      {daySlots.length} open
                    </span>
                  </button>
                ))}
              </div>
              <fieldset>
                <legend className="mb-2 text-sm text-muted">
                  {times[0] && formatLongDay(times[0].startsAt)}
                </legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {times.map((s) => (
                    <label
                      key={s.startsAt}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm transition-colors ${
                        startsAt === s.startsAt
                          ? "border-primary bg-primary-soft font-medium text-primary"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={s.startsAt}
                        checked={startsAt === s.startsAt}
                        onChange={() => setStartsAt(s.startsAt)}
                        className="sr-only"
                      />
                      {formatTime(s.startsAt)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">2. Session details</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Session type</legend>
            {(["ONLINE", "OFFLINE"] as const).map((t) => {
              const disabled = t === "OFFLINE" && !offersInPerson;
              return (
                <label
                  key={t}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                    disabled ? "opacity-50" : "cursor-pointer"
                  } ${type === t ? "border-primary bg-primary-soft" : "border-border"}`}
                >
                  <input
                    type="radio"
                    name="type"
                    checked={type === t}
                    disabled={disabled}
                    onChange={() => setType(t)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="font-medium">{APPOINTMENT_TYPE_LABEL[t]}</span>
                    <span className="block text-muted">
                      {t === "ONLINE"
                        ? "A private text conversation with the doctor at the booked time."
                        : offersInPerson
                          ? `At ${slots.data.clinicAddress}`
                          : "This doctor only offers online sessions."}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <TextArea
            id="note"
            label="What would you like to talk about? (optional)"
            hint="Only this doctor will see it."
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              Share my self-assessment results with this doctor
              <span className="block text-muted">
                Helps them prepare. Only your scores and risk levels are shared, never your AI
                chats. You can change this later.
              </span>
            </span>
          </label>
        </Card>

        {book.error && <Alert>{book.error.message}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">
            {startsAt ? (
              <>
                {formatLongDay(startsAt)} at <strong className="text-foreground">{formatTime(startsAt)}</strong>
              </>
            ) : (
              "Choose a time to continue"
            )}
          </p>
          <Button type="submit" disabled={!premium || !startsAt || book.isPending}>
            {book.isPending ? "Holding your time…" : `Pay ${formatBdt(doctor.data.fee)} and request`}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Your time is held for {PAYMENT_HOLD_MINUTES} minutes while you pay securely through
          SSLCommerz (bKash, Nagad, Rocket or card). The doctor sees your request once it&apos;s paid.
          If they decline or either of you cancels, you get a full refund.
        </p>
      </form>
    </div>
  );
}
