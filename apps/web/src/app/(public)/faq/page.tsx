import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { FaqGroup } from "@mindease/shared";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Frequently asked questions</h1>
        <p className="mt-2 text-muted">
          Can&apos;t find your answer?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Contact us
          </Link>
          .
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading questions…</p>}>
        <FaqList />
      </Suspense>
    </div>
  );
}

async function FaqList() {
  const groups = await serverApi<FaqGroup[]>("/content/faqs");
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.category} aria-labelledby={slugify(group.category)}>
          <h2 id={slugify(group.category)} className="mb-3 text-lg font-semibold">
            {group.category}
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {group.items.map((item) => (
              // Native disclosure: accessible and works without JavaScript.
              <details key={item.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
