"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentItem } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { formatBdt } from "@/components/doctor-card";
import { PaymentBadge, paymentLabel } from "@/components/payment-parts";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { api, refreshSession } from "@/lib/api";
import { meQueryKey } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { USER_NAV } from "../../nav";

/** Keep checking a pending payment for this long; the gateway can be slow to confirm. */
const POLL_MS = 3_000;
const POLL_LIMIT = 40;

export function PaymentResult() {
  const { reference } = useParams<{ reference: string }>();
  return <AppShell role="USER" nav={USER_NAV}>{() => <Result reference={reference} />}</AppShell>;
}

function Result({ reference }: { reference: string }) {
  const qc = useQueryClient();
  const polls = useRef(0);
  const payment = useQuery({
    queryKey: ["payments", reference],
    queryFn: () => api<PaymentItem>(`/payments/${reference}`),
    refetchInterval: (q) =>
      q.state.data?.status === "PENDING" && ++polls.current < POLL_LIMIT ? POLL_MS : false,
  });
  const status = payment.data?.status;

  useEffect(() => {
    if (status !== "SUCCEEDED") return;
    void qc.invalidateQueries({ queryKey: ["appointments"] });
    void qc.invalidateQueries({ queryKey: ["payments", "subscription"] });
    // The access token carries the plan; refresh it so Premium shows everywhere.
    void refreshSession().then(() => qc.invalidateQueries({ queryKey: meQueryKey }));
  }, [status, qc]);

  if (payment.isPending) return <p className="text-sm text-muted">Checking your payment…</p>;
  if (payment.error) return <Alert>{payment.error.message}</Alert>;
  const p = payment.data;
  const isBooking = p.purpose === "APPOINTMENT";

  const message = {
    PENDING: {
      title: "Waiting for confirmation",
      text: "We're waiting for the payment gateway to confirm. This page updates by itself. If you closed the payment window, the payment will be cancelled automatically and your time released.",
    },
    SUCCEEDED: {
      title: "Payment successful",
      text: isBooking
        ? "Your request has been sent to the doctor. We'll notify you when they confirm."
        : "Premium is active. Enjoy unlimited AI chat and doctor bookings.",
    },
    FAILED: {
      title: "Payment not completed",
      text: isBooking
        ? "No money was taken and the time slot was released. You can choose a time again."
        : "No money was taken. You can try again from the billing page.",
    },
    REFUND_DUE: {
      title: "Refund on its way",
      text: "We received your payment but couldn't use it for this booking. Our team will send the full amount back to your original payment method.",
    },
    REFUNDED: {
      title: "Refunded",
      text: "This payment was refunded to your original payment method.",
    },
  }[p.status];

  return (
    <Card className="mx-auto flex max-w-xl flex-col gap-4" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold">{message.title}</h1>
        <PaymentBadge status={p.status} />
      </div>
      <p className="text-sm leading-6">{message.text}</p>
      {p.failureReason && p.status !== "SUCCEEDED" && p.status !== "PENDING" && (
        <p className="text-sm text-muted">Reason: {p.failureReason}</p>
      )}
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-background p-4 text-sm">
        <div>
          <dt className="text-muted">For</dt>
          <dd className="font-medium">{paymentLabel(p)}</dd>
        </div>
        <div>
          <dt className="text-muted">Amount</dt>
          <dd className="font-medium">{formatBdt(p.amount)}</dd>
        </div>
        {p.appointmentStartsAt && (
          <div>
            <dt className="text-muted">Session</dt>
            <dd className="font-medium">{formatDateTime(p.appointmentStartsAt)}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Reference</dt>
          <dd className="font-mono text-xs">{p.reference}</dd>
        </div>
        {p.method && (
          <div>
            <dt className="text-muted">Paid with</dt>
            <dd className="font-medium">{p.method}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {isBooking ? (
          p.status === "FAILED" ? (
            <ButtonLink href="/doctors">Choose a time again</ButtonLink>
          ) : (
            <ButtonLink href="/dashboard/appointments">My appointments</ButtonLink>
          )
        ) : (
          <ButtonLink href={p.status === "SUCCEEDED" ? "/dashboard/chat" : "/dashboard/billing"}>
            {p.status === "SUCCEEDED" ? "Talk to the AI companion" : "Billing"}
          </ButtonLink>
        )}
        <ButtonLink href="/dashboard/billing" variant="secondary">
          Payment history
        </ButtonLink>
      </div>
    </Card>
  );
}
