import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">Contact us</h1>
        <p className="text-muted">
          Questions about the platform, your account, or a problem to report? Send us a message,
          no account needed. We usually reply within two working days.
        </p>
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          This form is not monitored around the clock. If you need urgent help, call{" "}
          <strong>999</strong> or see{" "}
          <Link href="/emergency" className="font-medium underline">
            emergency help
          </Link>
          .
        </p>
      </div>
      <div className="lg:col-span-2">
        <ContactForm />
      </div>
    </div>
  );
}
