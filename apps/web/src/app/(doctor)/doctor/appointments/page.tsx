"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppointmentItem } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Outcome, ReasonAction, StatusBadge, When } from "@/components/appointment-parts";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useNow } from "@/lib/use-now";
import { DOCTOR_NAV } from "../nav";
import { useDoctorAppointments } from "../queries";

export default function DoctorAppointmentsPage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Appointments />}</AppShell>;
}

function Appointments() {
  const list = useDoctorAppointments();
  const now = useNow();
  if (list.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (list.error) return <Alert>{list.error.message}</Alert>;

  const starts = (a: AppointmentItem) => Date.parse(a.startsAt);
  const requests = list.data.filter((a) => a.status === "REQUESTED");
  const upcoming = list.data.filter((a) => a.status === "ACCEPTED" && starts(a) > now);
  const toComplete = list.data.filter((a) => a.status === "ACCEPTED" && starts(a) <= now);
  const history = list.data
    .filter((a) => !["REQUESTED", "ACCEPTED"].includes(a.status))
    .reverse();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <p className="text-sm text-muted">All times are Bangladesh time.</p>
      </div>
      <Section title="Booking requests" empty="No requests waiting." items={requests} />
      <Section title="Upcoming" empty="No confirmed sessions coming up." items={upcoming} />
      {toComplete.length > 0 && (
        <Section title="Mark as completed" empty="" items={toComplete} />
      )}
      {history.length > 0 && <Section title="History" empty="" items={history} />}
    </div>
  );
}

function Section({ title, empty, items }: { title: string; empty: string; items: AppointmentItem[] }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} {items.length > 0 && <span className="text-sm font-normal text-muted">({items.length})</span>}
      </h2>
      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{empty}</p>
        </Card>
      ) : (
        items.map((a) => <AppointmentCard key={a.id} appointment={a} />)
      )}
    </section>
  );
}

function AppointmentCard({ appointment: a }: { appointment: AppointmentItem }) {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: ({ action, reason }: { action: "accept" | "decline" | "cancel" | "complete"; reason?: string }) =>
      api<AppointmentItem>(`/doctor/appointments/${a.id}/${action}`, {
        method: "POST",
        body: reason === undefined ? undefined : { reason },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["doctor", "schedule"] });
    },
  });
  const started = Date.parse(a.startsAt) <= useNow();

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{a.patient.name}</p>
        <StatusBadge status={a.status} />
      </div>
      <When appointment={a} />
      {a.patientNote && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">Patient&apos;s note: </span>
          {a.patientNote}
        </p>
      )}
      <Outcome appointment={a} />
      {act.error && <Alert>{act.error.message}</Alert>}

      {a.status === "REQUESTED" && (
        <div className="flex flex-wrap items-start gap-2">
          <Button disabled={act.isPending} onClick={() => act.mutate({ action: "accept" })}>
            Confirm
          </Button>
          <ReasonAction
            label="Decline"
            confirmLabel="Decline request"
            prompt="Reason for declining (shown to the patient)"
            required
            pending={act.isPending}
            onConfirm={(reason) => act.mutate({ action: "decline", reason })}
          />
        </div>
      )}
      {a.status === "ACCEPTED" && !started && (
        <div>
          <ReasonAction
            label="Cancel session"
            confirmLabel="Cancel session"
            prompt="Reason for cancelling (shown to the patient)"
            required
            variant="ghost"
            pending={act.isPending}
            onConfirm={(reason) => act.mutate({ action: "cancel", reason })}
          />
        </div>
      )}
      {a.status === "ACCEPTED" && started && (
        <Button className="w-fit" disabled={act.isPending} onClick={() => act.mutate({ action: "complete" })}>
          Mark completed
        </Button>
      )}
    </Card>
  );
}
