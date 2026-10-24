"use client";

import { useQuery } from "@tanstack/react-query";
import { APPOINTMENT_TYPE_LABEL, type Earnings } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { formatBdt } from "@/components/doctor-card";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { DOCTOR_NAV } from "../nav";

export default function EarningsPage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <EarningsView />}</AppShell>;
}

function EarningsView() {
  const earnings = useQuery({ queryKey: ["doctor", "earnings"], queryFn: () => api<Earnings>("/doctor/earnings") });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Earnings</h1>
        <p className="text-sm text-muted">
          Completed, paid consultations. Patients pay MindEase Oasis, which pays out to you
          separately.
        </p>
      </div>
      {earnings.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : earnings.error ? (
        <Alert>{earnings.error.message}</Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="This month" value={formatBdt(earnings.data.totals.thisMonth)} />
            <Stat label="All time" value={formatBdt(earnings.data.totals.earned)} />
            <Stat label="Completed sessions" value={String(earnings.data.totals.sessions)} />
          </div>
          <Card className="overflow-x-auto p-0">
            {earnings.data.items.length === 0 ? (
              <p className="p-6 text-sm text-muted">
                Nothing yet. Sessions appear here once you mark them completed.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Consultation ID</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium">Fee</th>
                    <th className="px-4 py-3 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.data.items.map((i) => (
                    <tr key={i.appointmentId} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{i.appointmentId.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3">{i.patientName}</td>
                      <td className="px-4 py-3">
                        {formatDateTime(i.sessionAt)}
                        <span className="block text-xs text-muted">{APPOINTMENT_TYPE_LABEL[i.type]}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{formatBdt(i.fee)}</td>
                      <td className="px-4 py-3">
                        {i.paidAt ? formatDateTime(i.paidAt) : "—"}
                        <span className="block font-mono text-xs text-muted">{i.paymentReference}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </Card>
  );
}
