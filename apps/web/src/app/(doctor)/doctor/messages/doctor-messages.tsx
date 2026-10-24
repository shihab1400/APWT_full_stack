"use client";

import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Consultations } from "@/components/consultations";
import { DOCTOR_NAV } from "../nav";

export function DoctorMessages() {
  const selected = useSearchParams().get("appointment");
  return (
    <AppShell role="DOCTOR" nav={DOCTOR_NAV}>
      {() => <Consultations selectedId={selected} basePath="/doctor/messages" />}
    </AppShell>
  );
}
