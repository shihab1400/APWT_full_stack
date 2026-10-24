"use client";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

const NAV = [{ href: "/dashboard", label: "Overview" }];

export default function UserDashboard() {
  return (
    <AppShell role="USER" nav={NAV}>
      {(user) => (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Hi {user.name.split(" ")[0]}, how are you today?</h1>
            <p className="mt-1 text-sm text-muted">
              Plan: <strong>{user.tier === "PAID" ? "Premium" : "Free"}</strong>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Placeholder title="AI companion" text="Talk things through, any time." />
            <Placeholder title="Self-assessment" text="A short check-in on how you're doing." />
            <Placeholder title="Find a doctor" text="Book a verified professional." />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <p className="mt-4 text-xs text-muted">Coming soon</p>
    </Card>
  );
}
