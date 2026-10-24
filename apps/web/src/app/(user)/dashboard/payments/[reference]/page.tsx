import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentResult } from "./payment-result";

export const metadata: Metadata = { title: "Payment" };

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentResult />
    </Suspense>
  );
}
