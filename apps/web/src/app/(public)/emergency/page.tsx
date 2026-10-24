import type { Metadata } from "next";
import { Suspense } from "react";
import { FALLBACK_HOTLINES, Hotlines, HotlineList } from "@/components/hotlines";

export const metadata: Metadata = { title: "Emergency help" };

export default function EmergencyPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="rounded-2xl bg-danger-soft p-6">
        <h1 className="text-3xl font-semibold text-danger">If you are in danger, call 999 now</h1>
        <p className="mt-3">
          If you are thinking about ending your life, have hurt yourself, or feel unable to keep
          yourself safe, call <strong>999</strong> or go to the nearest hospital emergency
          department. You don&apos;t need an account or permission to get help.
        </p>
      </div>

      <section aria-labelledby="lines" className="flex flex-col gap-4">
        <h2 id="lines" className="text-xl font-semibold">
          Emergency and support lines
        </h2>
        <Suspense fallback={<HotlineList hotlines={FALLBACK_HOTLINES} />}>
          <Hotlines />
        </Suspense>
      </section>

      <section aria-labelledby="meanwhile" className="flex flex-col gap-3">
        <h2 id="meanwhile" className="text-xl font-semibold">
          While you wait for help
        </h2>
        <ul className="ml-5 list-disc space-y-2 text-muted">
          <li>Stay with someone you trust, or ask someone to come and be with you.</li>
          <li>Move away from anything you could use to hurt yourself.</li>
          <li>Breathe slowly: in for four counts, out for six.</li>
          <li>Remind yourself that intense feelings pass, and that help is on the way.</li>
        </ul>
      </section>
    </div>
  );
}
