"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AdminDoctorRow, DoctorProfileStatus } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { formatBdt } from "@/components/doctor-card";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

const TABS: { status?: DoctorProfileStatus; label: string }[] = [
  { status: "SUBMITTED", label: "Waiting for review" },
  { status: "APPROVED", label: "Verified" },
  { status: "REJECTED", label: "Sent back" },
  { status: "INCOMPLETE", label: "Incomplete" },
  { label: "All" },
];

const STATUS_LABEL: Record<DoctorProfileStatus, string> = {
  SUBMITTED: "Waiting for review",
  APPROVED: "Verified",
  REJECTED: "Sent back",
  INCOMPLETE: "Incomplete",
};

export default function AdminDoctorsPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Doctors />}</AppShell>;
}

function Doctors() {
  const [tab, setTab] = useState(0);
  const status = TABS[tab].status;
  const doctors = useQuery({
    queryKey: ["admin", "doctors", status ?? "ALL"],
    queryFn: () => api<AdminDoctorRow[]>(`/admin/doctors${status ? `?status=${status}` : ""}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Doctor approvals</h1>
        <p className="text-sm text-muted">
          Check each licence before verifying. Verified doctors appear in the public directory and
          can be booked.
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
      {doctors.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : doctors.error ? (
        <Alert>{doctors.error.message}</Alert>
      ) : doctors.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No doctors here.</p>
        </Card>
      ) : (
        doctors.data.map((d) => <DoctorReview key={d.id} doctor={d} />)
      )}
    </div>
  );
}

function DoctorReview({ doctor: d }: { doctor: AdminDoctorRow }) {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: (v: { action: "approve" | "reject"; reason?: string }) =>
      api(`/admin/doctors/${d.id}/${v.action}`, {
        method: "POST",
        body: v.reason ? { reason: v.reason } : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "doctors"] }),
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">{d.name}</h2>
          <p className="text-sm text-muted">
            <a href={`mailto:${d.email}`} className="hover:underline">
              {d.email}
            </a>
            {d.accountStatus === "DEACTIVATED" && <span className="text-danger"> · account deactivated</span>}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
          {STATUS_LABEL[d.status]}
        </span>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Specialization" value={d.specialization} />
        <Item label="Qualifications" value={d.qualifications} />
        <Item label="Experience" value={d.experienceYears != null ? `${d.experienceYears} years` : null} />
        <Item label="Fee" value={d.fee ? formatBdt(d.fee) : null} />
        <Item label="In-person address" value={d.clinicAddress ?? "Online only"} />
        <Item label="Submitted" value={d.submittedAt ? formatDateTime(d.submittedAt) : null} />
        <Item label="Reviewed" value={d.reviewedAt ? formatDateTime(d.reviewedAt) : null} />
        <div>
          <dt className="text-muted">Licence</dt>
          <dd className="font-medium">
            {d.hasLicense ? (
              <a
                href={`/api/admin/doctors/${d.id}/license`}
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline"
              >
                View {d.licenseMimeType === "application/pdf" ? "PDF" : "image"} ↗
              </a>
            ) : (
              "Not uploaded"
            )}
          </dd>
        </div>
      </dl>
      {d.bio && <p className="text-sm leading-6 text-muted">{d.bio}</p>}
      {d.rejectReason && d.status === "REJECTED" && (
        <p className="text-sm">
          <span className="text-muted">Sent back because: </span>
          {d.rejectReason}
        </p>
      )}

      {decide.error && <Alert>{decide.error.message}</Alert>}
      {d.status === "SUBMITTED" && (
        <div className="flex flex-wrap items-start gap-2 border-t border-border pt-4">
          <Button disabled={decide.isPending} onClick={() => decide.mutate({ action: "approve" })}>
            Approve and verify
          </Button>
          <ReasonAction
            label="Send back"
            confirmLabel="Send back to doctor"
            prompt="What does the doctor need to fix? (sent to them)"
            required
            pending={decide.isPending}
            onConfirm={(reason) => decide.mutate({ action: "reject", reason })}
          />
        </div>
      )}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}
