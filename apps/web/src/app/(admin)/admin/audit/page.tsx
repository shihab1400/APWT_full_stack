"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AuditLogItem, AuditLogPage } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

/** "QUIZ_QUESTION_UPDATED" → "Quiz question updated" */
const humanize = (action: string) => {
  const s = action.toLowerCase().replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function AuditPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Audit />}</AppShell>;
}

function Audit() {
  const [filters, setFilters] = useState({ action: "", from: "", to: "" });
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const log = useQuery({
    queryKey: ["admin", "audit", query],
    queryFn: () => api<AuditLogPage>(`/admin/audit-logs${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted">Every administrative action, with the admin who took it and when.</p>
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="action" className="text-xs font-medium text-muted">
            Action
          </label>
          <select
            id="action"
            className={inputClass}
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          >
            <option value="">All</option>
            {log.data?.actions.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </select>
        </div>
        {(["from", "to"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <label htmlFor={k} className="text-xs font-medium text-muted">
              {k === "from" ? "From" : "To"}
            </label>
            <input
              id={k}
              type="date"
              className={inputClass}
              value={filters[k]}
              onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
            />
          </div>
        ))}
      </Card>
      <Card className="overflow-x-auto p-0">
        {log.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : log.error ? (
          <div className="p-6">
            <Alert>{log.error.message}</Alert>
          </div>
        ) : log.data.items.length === 0 ? (
          <p className="p-6 text-sm text-muted">No actions match.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Reason and details</th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ item: i }: { item: AuditLogItem }) {
  const meta = i.meta && typeof i.meta === "object" && Object.keys(i.meta).length ? JSON.stringify(i.meta) : null;
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(i.createdAt)}</td>
      <td className="px-4 py-3">
        {i.actor.name}
        <span className="block font-mono text-xs text-muted" title="Admin ID">
          {i.actor.id}
        </span>
      </td>
      <td className="px-4 py-3 font-medium">{humanize(i.action)}</td>
      <td className="px-4 py-3">
        {i.targetType ?? "—"}
        {i.targetId && <span className="block font-mono text-xs text-muted">{i.targetId.slice(0, 8)}</span>}
      </td>
      <td className="max-w-md px-4 py-3">
        {i.reason && <p>{i.reason}</p>}
        {meta && <p className="break-all font-mono text-xs text-muted">{meta}</p>}
      </td>
    </tr>
  );
}
