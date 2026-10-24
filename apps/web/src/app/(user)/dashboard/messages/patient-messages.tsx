"use client";

import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Consultations } from "@/components/consultations";
import { USER_NAV } from "../nav";

export function PatientMessages() {
  const selected = useSearchParams().get("appointment");
  return (
    <AppShell role="USER" nav={USER_NAV}>
      {() => <Consultations selectedId={selected} basePath="/dashboard/messages" />}
    </AppShell>
  );
}
