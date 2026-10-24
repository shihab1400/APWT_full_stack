"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";

export default function PublicError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <Card className="mx-auto mt-10 flex max-w-lg flex-col gap-4 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t load this page</h1>
      <p className="text-sm text-muted">
        Please try again in a moment. If you need urgent help, call <strong>999</strong>.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/emergency" className="rounded-lg px-4 py-2 text-sm text-danger hover:underline">
          Emergency help
        </Link>
      </div>
    </Card>
  );
}
