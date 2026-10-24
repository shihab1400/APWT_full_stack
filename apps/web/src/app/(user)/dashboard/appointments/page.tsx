"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppointmentItem } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Outcome, ReasonAction, StatusBadge, When } from "@/components/appointment-parts";
import { formatBdt } from "@/components/doctor-card";
import { PaymentBadge } from "@/components/payment-parts";
import { Alert, ButtonLink, Card } from "@/components/ui";
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
