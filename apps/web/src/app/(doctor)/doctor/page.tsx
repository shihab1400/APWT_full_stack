"use client";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

const NAV = [{ href: "/doctor", label: "Overview" }];

export default function DoctorDashboard() {
  return (
    <AppShell role="DOCTOR" nav={NAV}>
      {(user) => (
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
          <Card className="bg-warning-soft">
            <h2 className="font-medium">Your profile is awaiting verification</h2>
            <p className="mt-1 text-sm text-muted">
              Patients can&apos;t see or book you until an admin approves your credentials.
              Profile setup and credential upload arrive in the next phase.
            </p>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
