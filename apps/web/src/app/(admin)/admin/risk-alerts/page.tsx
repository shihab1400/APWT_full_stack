"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RiskAlertItem, RiskAlertList } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { RiskBadge } from "@/components/risk-badge";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

const TABS = [
  { label: "Needs follow-up", query: "?open=true" },
  { label: "Followed up", query: "?open=false" },
  { label: "All", query: "" },
];

export default function RiskAlertsPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Alerts />}</AppShell>;
}

function Alerts() {
  const [tab, setTab] = useState(0);
  const alerts = useQuery({
    queryKey: ["admin", "risk-alerts", tab],
    queryFn: () => api<RiskAlertList>(`/admin/risk-alerts${TABS[tab].query}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Risk alerts</h1>
        <p className="text-sm text-muted">
          Users flagged as high risk by a self-assessment or by crisis language in the AI chat. They
          were shown the emergency hotlines and recommended a doctor. Chat contents are never shown
          here.
        </p>
      </div>
      {alerts.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Needs follow-up" value={alerts.data.counts.open} highlight={alerts.data.counts.open > 0} />
          <Stat label="Booked a doctor afterwards" value={alerts.data.counts.bookedDoctor} />
          <Stat label="All alerts" value={alerts.data.counts.total} />
        </div>
      )}
      <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-1">
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
      <Card className="overflow-x-auto p-0">
        {alerts.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : alerts.error ? (
          <div className="p-6">
            <Alert>{alerts.error.message}</Alert>
          </div>
        ) : alerts.data.items.length === 0 ? (
          <p className="p-6 text-sm text-muted">No alerts here.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Booked a doctor?</th>
                <th className="px-4 py-3 font-medium">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {alerts.data.items.map((a) => (
                <Row key={a.id} alert={a} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ alert: a }: { alert: RiskAlertItem }) {
  const qc = useQueryClient();
  const followUp = useMutation({
    mutationFn: (note: string) => api(`/admin/risk-alerts/${a.id}/follow-up`, { method: "POST", body: { note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "risk-alerts"] }),
  });

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(a.createdAt)}</td>
      <td className="px-4 py-3">
        {a.user.name}
        <a href={`mailto:${a.user.email}`} className="block text-xs text-muted hover:underline">
          {a.user.email}
        </a>
      </td>
      <td className="px-4 py-3">
        <RiskBadge level={a.severity} />
      </td>
      <td className="px-4 py-3">
        {a.source === "QUIZ" ? "Self-assessment" : "AI chat"}
        {a.detail && <span className="block text-xs text-muted">{a.detail}</span>}
      </td>
      <td className="px-4 py-3">
        {a.bookedDoctor ? <span className="text-primary">✓ Yes</span> : <span className="text-muted">Not yet</span>}
      </td>
      <td className="min-w-56 px-4 py-3">
        {a.followedUp ? (
          <span className="text-xs text-muted">
            Done {a.followedUpAt && formatDateTime(a.followedUpAt)}
            {a.followUpNote && <span className="block">{a.followUpNote}</span>}
          </span>
        ) : (
          <>
            <ReasonAction
              label="Mark followed up"
              confirmLabel="Save"
              prompt="What was done? (logged)"
              required
              pending={followUp.isPending}
              onConfirm={(note) => followUp.mutate(note)}
            />
            {followUp.error && <span className="block text-xs text-danger">{followUp.error.message}</span>}
          </>
        )}
      </td>
    </tr>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-400 bg-warning-soft" : ""}>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-3xl font-semibold">{value}</p>
    </Card>
  );
}
