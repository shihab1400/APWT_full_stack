import type { Metadata } from "next";
import { Suspense } from "react";
import { PatientMessages } from "./patient-messages";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <Suspense>
      <PatientMessages />
    </Suspense>
  );
}
