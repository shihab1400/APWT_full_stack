"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Checkout, PaymentItem, SubscriptionStatus } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { formatBdt } from "@/components/doctor-card";
import { PaymentBadge, paymentLabel } from "@/components/payment-parts";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatLongDay } from "@/lib/datetime";
import { USER_NAV } from "../nav";

export default function BillingPage() {
  return (
    <AppShell role="USER" nav={USER_NAV}>
      {() => (
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold">Plan and billing</h1>
          <Plan />
          <History />
        </div>
      )}
    </AppShell>
  );
}

function Plan() {
  const status = useQuery({
    queryKey: ["payments", "subscription"],
    queryFn: () => api<SubscriptionStatus>("/payments/subscription"),
  });
  const upgrade = useMutation({
    mutationFn: () => api<Checkout>("/payments/subscription", { method: "POST" }),
    onSuccess: (checkout) => window.location.assign(checkout.checkoutUrl),
  });

  if (status.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (status.error) return <Alert>{status.error.message}</Alert>;
  const s = status.data;
  const premium = s.tier === "PAID";

  return (
    <Card className={`flex flex-col gap-4 ${premium ? "border-primary" : ""}`}>
      <div>
        <p className="text-sm text-muted">Current plan</p>
        <p className="text-2xl font-semibold">{premium ? "Premium" : "Free"}</p>
        {premium && (
          <p className="text-sm text-muted">
            {s.endsAt ? `Active until ${formatLongDay(s.endsAt)}` : "Active, no end date"}
          </p>
        )}
      </div>
      {!premium && (
        <ul className="flex flex-col gap-1 text-sm">
          <li>✓ Unlimited AI companion chat</li>
          <li>✓ Book online (text) or in-person consultations</li>
          <li>✓ Rate and review your doctors</li>
        </ul>
      )}
      {(!premium || s.endsAt) && (
        <div className="flex flex-col gap-2">
          <Button className="w-fit" disabled={upgrade.isPending || upgrade.isSuccess} onClick={() => upgrade.mutate()}>
            {upgrade.isPending || upgrade.isSuccess
              ? "Taking you to payment…"
              : premium
                ? `Add ${s.periodDays} days for ${formatBdt(s.price)}`
                : `Upgrade for ${formatBdt(s.price)} / ${s.periodDays} days`}
          </Button>
          <p className="text-xs text-muted">
            One-off payment through SSLCommerz (bKash, Nagad, Rocket or card). No automatic renewal.
            {premium && " Extra days are added after your current end date."}
          </p>
        </div>
      )}
      {upgrade.error && <Alert>{upgrade.error.message}</Alert>}
    </Card>
  );
}

function History() {
  const payments = useQuery({ queryKey: ["payments", "mine"], queryFn: () => api<PaymentItem[]>("/payments") });
  return (
    <section className="flex flex-col gap-3" aria-labelledby="history">
      <h2 id="history" className="text-lg font-semibold">
        Payment history
      </h2>
      <Card className="overflow-x-auto p-0">
        {payments.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : payments.error ? (
          <div className="p-6">
            <Alert>{payments.error.message}</Alert>
          </div>
        ) : payments.data.length === 0 ? (
          <p className="p-6 text-sm text-muted">No payments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">For</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((p) => (
                <tr key={p.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    {paymentLabel(p)}
                    {p.failureReason && p.status !== "SUCCEEDED" && (
                      <span className="block text-xs text-muted">{p.failureReason}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatBdt(p.amount)}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/payments/${p.reference}`} className="font-mono text-xs text-primary hover:underline">
                      {p.reference}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}
