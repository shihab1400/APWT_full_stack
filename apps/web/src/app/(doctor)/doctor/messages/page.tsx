import type { Metadata } from "next";
import { Suspense } from "react";
import { DoctorMessages } from "./doctor-messages";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <Suspense>
      <DoctorMessages />
    </Suspense>
  );
}
