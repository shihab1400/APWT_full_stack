"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  APPOINTMENT_TYPE_LABEL,
  AppointmentStatus,
  type AppointmentItem,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Outcome, StatusBadge } from "@/components/appointment-parts";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

interface Filters {
  status: string;
  type: string;
  from: string;
  to: string;
}

const selectClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

export default function AdminAppointmentsPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Appointments />}</AppShell>;
}

function Appointments() {
  const [filters, setFilters] = useState<Filters>({ status: "", type: "", from: "", to: "" });
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const list = useQuery({
    queryKey: ["admin", "appointments", query],
    queryFn: () => api<AppointmentItem[]>(`/admin/appointments${query ? `?${query}` : ""}`),
  });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <p className="text-sm text-muted">Every scheduled, completed and cancelled session. Bangladesh time.</p>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Filter label="Status" id="status">
          <select id="status" className={selectClass} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {Object.values(AppointmentStatus).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Type" id="type">
          <select id="type" className={selectClass} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All</option>
            <option value="ONLINE">{APPOINTMENT_TYPE_LABEL.ONLINE}</option>
            <option value="OFFLINE">{APPOINTMENT_TYPE_LABEL.OFFLINE}</option>
          </select>
        </Filter>
        <Filter label="From" id="from">
          <input id="from" type="date" className={selectClass} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </Filter>
        <Filter label="To" id="to">
          <input id="to" type="date" className={selectClass} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </Filter>
        {query && (
          <button
            type="button"
            className="pb-2 text-sm text-primary hover:underline"
            onClick={() => setFilters({ status: "", type: "", from: "", to: "" })}
          >
            Clear filters
          </button>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        {list.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : list.error ? (
          <div className="p-6">
            <Alert>{list.error.message}</Alert>
          </div>
        ) : list.data.length === 0 ? (
          <p className="p-6 text-sm text-muted">No appointments match these filters.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(a.startsAt)}</td>
                  <td className="px-4 py-3">{a.patient.name}</td>
                  <td className="px-4 py-3">{a.doctor.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{APPOINTMENT_TYPE_LABEL[a.type]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    <Outcome appointment={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {list.data && list.data.length > 0 && (
        <p className="text-xs text-muted">{list.data.length} appointment{list.data.length === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}

function Filter({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
