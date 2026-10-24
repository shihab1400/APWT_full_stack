"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { PatientSummary } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { RiskBadge } from "@/components/risk-badge";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { DOCTOR_NAV } from "../nav";

export default function PatientsPage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Patients />}</AppShell>;
}

function Patients() {
  const patients = useQuery({
    queryKey: ["doctor", "patients"],
    queryFn: () => api<PatientSummary[]>("/doctor/patients"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Patients</h1>
        <p className="text-sm text-muted">
          People with a booking request, confirmed or completed session with you. Assessment results
          appear only when the patient has chosen to share them.
        </p>
      </div>
      {patients.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : patients.error ? (
        <Alert>{patients.error.message}</Alert>
      ) : patients.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No patients yet.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Next session</th>
                <th className="px-4 py-3 font-medium">Last session</th>
                <th className="px-4 py-3 font-medium">Latest assessment</th>
              </tr>
            </thead>
            <tbody>
              {patients.data.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/doctor/patients/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {p.appointmentCount} session{p.appointmentCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.nextSessionAt ? formatDateTime(p.nextSessionAt) : "—"}</td>
                  <td className="px-4 py-3">{p.lastSessionAt ? formatDateTime(p.lastSessionAt) : "—"}</td>
                  <td className="px-4 py-3">
                    {p.latestAssessment ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {p.latestAssessment.score}/{p.latestAssessment.maxScore}
                        <RiskBadge level={p.latestAssessment.riskLevel} />
                      </span>
                    ) : (
                      <span className="text-muted">{p.sharesAssessments ? "None taken" : "Not shared"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
