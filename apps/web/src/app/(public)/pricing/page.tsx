import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Pricing } from "@mindease/shared";
import { formatBdt } from "@/components/doctor-card";
import { ButtonLink, Card } from "@/components/ui";
import { serverApi } from "@/lib/server-api";
import { peekSession } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Simple, transparent pricing</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Start free. Upgrade when you want unlimited support and access to consultations.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading prices…</p>}>
        <Plans />
      </Suspense>
    </div>
  );
}

async function Plans() {
  const [pricing, session] = await Promise.all([serverApi<Pricing>("/content/pricing"), peekSession()]);
  const fees = pricing.consultationFees;
  const patient = session.signedIn && session.role === "USER";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        {pricing.plans.map((plan) => (
          <Card
            key={plan.tier}
            className={`flex flex-col gap-4 ${plan.tier === "PAID" ? "border-primary" : ""}`}
          >
            <div>
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2">
                <span className="text-3xl font-semibold">
                  {plan.price === 0 ? "Free" : formatBdt(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-muted"> / month</span>}
              </p>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-primary">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {patient ? (
              plan.tier === "PAID" && (
                <ButtonLink href="/dashboard/billing" className="mt-auto">
                  Upgrade to Premium
                </ButtonLink>
              )
            ) : (
              <ButtonLink
                href="/register"
                variant={plan.tier === "PAID" ? "primary" : "secondary"}
                className="mt-auto"
              >
                {plan.tier === "PAID" ? "Start free, upgrade anytime" : "Create a free account"}
              </ButtonLink>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-xl font-semibold">Consultation fees</h2>
        {fees ? (
          <p className="mt-2 text-muted">
            Each doctor sets their own fee. Right now, consultations with our {fees.doctorCount}{" "}
            verified doctor{fees.doctorCount === 1 ? "" : "s"} range from{" "}
            <strong className="text-foreground">{formatBdt(fees.min)}</strong> to{" "}
            <strong className="text-foreground">{formatBdt(fees.max)}</strong> per session. You
            are never charged more than the fee shown on the doctor&apos;s profile.
          </p>
        ) : (
          <p className="mt-2 text-muted">Doctor fees will appear here once doctors are verified.</p>
        )}
        <Link href="/doctors" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          See doctors and their fees →
        </Link>
      </Card>
    </div>
  );
}
