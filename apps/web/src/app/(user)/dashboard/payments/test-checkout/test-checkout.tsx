"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PaymentItem, TestCheckoutDto } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { formatBdt } from "@/components/doctor-card";
import { paymentLabel } from "@/components/payment-parts";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { USER_NAV } from "../../nav";

/**
 * Stand-in for the SSLCommerz page, used only while no SSLCommerz credentials
 * are configured. The API refuses these calls once the real gateway is set up.
 */
export function TestCheckout() {
  const reference = useSearchParams().get("ref") ?? "";
  return <AppShell role="USER" nav={USER_NAV}>{() => <Checkout reference={reference} />}</AppShell>;
}

function Checkout({ reference }: { reference: string }) {
  const router = useRouter();
  const payment = useQuery({
    queryKey: ["payments", reference],
    queryFn: () => api<PaymentItem>(`/payments/${reference}`),
    enabled: !!reference,
  });
  const finish = useMutation({
    mutationFn: (outcome: TestCheckoutDto["outcome"]) =>
      api<PaymentItem>("/payments/test/complete", { method: "POST", body: { reference, outcome } }),
    onSuccess: () => router.replace(`/dashboard/payments/${reference}`),
  });

  if (!reference) return <Alert>Missing payment reference.</Alert>;
  if (payment.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (payment.error) return <Alert>{payment.error.message}</Alert>;
  const p = payment.data;

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
        <strong>Test payment mode.</strong> SSLCommerz isn&apos;t configured, so no real money moves.
        Choose what the gateway should report.
      </p>
      <div>
        <p className="text-sm text-muted">{paymentLabel(p)}</p>
        <p className="text-3xl font-semibold">{formatBdt(p.amount)}</p>
        <p className="font-mono text-xs text-muted">{p.reference}</p>
      </div>
      {p.status !== "PENDING" ? (
        <Alert tone="info">This payment is already {p.status.toLowerCase()}.</Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <Button disabled={finish.isPending} onClick={() => finish.mutate("PAID")}>
            Pay {formatBdt(p.amount)} (test)
          </Button>
          <Button variant="secondary" disabled={finish.isPending} onClick={() => finish.mutate("FAILED")}>
            Simulate a failed payment
          </Button>
          <Button variant="ghost" disabled={finish.isPending} onClick={() => finish.mutate("CANCELLED")}>
            Cancel
          </Button>
        </div>
      )}
      {finish.error && <Alert>{finish.error.message}</Alert>}
    </Card>
  );
}
