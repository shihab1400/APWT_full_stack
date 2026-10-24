"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PaymentStatus, type AdminPaymentItem, type AdminPaymentLedger } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { formatBdt } from "@/components/doctor-card";
import { PaymentBadge } from "@/components/payment-parts";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

interface Filters {
  status: string;
  purpose: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { status: "", purpose: "", from: "", to: "" };

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  SUCCEEDED: "Success",
  FAILED: "Failed",
  REFUND_DUE: "Refund due",
  REFUNDED: "Refunded",
};

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

export default function AdminPaymentsPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Ledger />}</AppShell>;
}

function Ledger() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const ledger = useQuery({
    queryKey: ["admin", "payments", query],
    queryFn: () => api<AdminPaymentLedger>(`/admin/payments${query ? `?${query}` : ""}`),
  });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted">
          Every payment is collected into the platform account. Refunds marked here must first be
          sent from the SSLCommerz merchant panel or wallet.
        </p>
      </div>

      {ledger.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Total label="Received" value={ledger.data.totals.received} />
          <Total label="Refunds due" value={ledger.data.totals.refundDue} highlight={ledger.data.totals.refundDue > 0} />
          <Total label="Refunded" value={ledger.data.totals.refunded} />
        </div>
      )}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Filter label="Status" id="status">
          <select id="status" className={inputClass} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {Object.values(PaymentStatus).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="For" id="purpose">
          <select id="purpose" className={inputClass} value={filters.purpose} onChange={(e) => set({ purpose: e.target.value })}>
            <option value="">All</option>
            <option value="APPOINTMENT">Consultations</option>
            <option value="SUBSCRIPTION">Premium</option>
          </select>
        </Filter>
        <Filter label="From" id="from">
          <input id="from" type="date" className={inputClass} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </Filter>
        <Filter label="To" id="to">
          <input id="to" type="date" className={inputClass} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </Filter>
        {query && (
          <button type="button" className="pb-2 text-sm text-primary hover:underline" onClick={() => setFilters(EMPTY)}>
            Clear filters
          </button>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        {ledger.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : ledger.error ? (
          <div className="p-6">
            <Alert>{ledger.error.message}</Alert>
          </div>
        ) : ledger.data.items.length === 0 ? (
          <p className="p-6 text-sm text-muted">No payments match these filters.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Transaction</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.data.items.map((p) => (
                <Row key={p.id} payment={p} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ payment: p }: { payment: AdminPaymentItem }) {
  const qc = useQueryClient();
  const refund = useMutation({
    mutationFn: (note: string) => api(`/admin/payments/${p.id}/refund`, { method: "POST", body: { note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payments"] }),
  });

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(p.createdAt)}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs">{p.reference}</span>
        {p.gatewayTxnId && <span className="block font-mono text-xs text-muted">{p.gatewayTxnId}</span>}
        <span className="block text-xs text-muted">
          {p.purpose === "SUBSCRIPTION" ? "Premium" : "Consultation"}
          {p.method && ` · ${p.method}`}
        </span>
      </td>
      <td className="px-4 py-3">
        {p.user.name}
        <span className="block text-xs text-muted">{p.user.email}</span>
      </td>
      <td className="px-4 py-3">{p.doctorName ?? "—"}</td>
      <td className="whitespace-nowrap px-4 py-3 font-medium">{formatBdt(p.amount)}</td>
      <td className="min-w-48 px-4 py-3">
        <PaymentBadge status={p.status} />
        {p.failureReason && <span className="mt-1 block text-xs text-muted">{p.failureReason}</span>}
        {p.refundedAt && <span className="mt-1 block text-xs text-muted">Refunded {formatDateTime(p.refundedAt)}</span>}
        {p.status === "REFUND_DUE" && (
          <div className="mt-2">
            <ReasonAction
              label="Mark refunded"
              confirmLabel="Confirm refund sent"
              prompt="How was it refunded? (e.g. bKash reversal ID)"
              required
              pending={refund.isPending}
              onConfirm={(note) => refund.mutate(note)}
            />
            {refund.error && <span className="mt-1 block text-xs text-danger">{refund.error.message}</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

function Total({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-400 bg-warning-soft" : ""}>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold">{formatBdt(value)}</p>
    </Card>
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
