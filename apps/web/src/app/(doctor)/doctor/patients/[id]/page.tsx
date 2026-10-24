import type { Metadata } from "next";
import { Suspense } from "react";
import { PatientRecord } from "./patient-record";

export const metadata: Metadata = { title: "Patient record" };

export default function PatientPage() {
  return (
    <Suspense>
      <PatientRecord />
    </Suspense>
  );
}
