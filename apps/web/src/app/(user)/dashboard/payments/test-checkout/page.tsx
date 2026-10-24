import type { Metadata } from "next";
import { Suspense } from "react";
import { TestCheckout } from "./test-checkout";

export const metadata: Metadata = { title: "Test payment" };

export default function TestCheckoutPage() {
  return (
    <Suspense>
      <TestCheckout />
    </Suspense>
  );
}
