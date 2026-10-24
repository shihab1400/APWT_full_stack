import Link from "next/link";
import { Suspense } from "react";
import type { BlogSummary } from "@mindease/shared";
import { HeroArt } from "@/components/hero-art";
import { FALLBACK_HOTLINES, Hotlines, HotlineList } from "@/components/hotlines";
import { Card } from "@/components/ui";
import { serverApi } from "@/lib/server-api";

const SERVICES = [
  {
    title: "AI companion",
    text: "A supportive, private space to talk things through, day or night.",
    href: "/register",
  },
  {
    title: "Self-assessment",
    text: "A short check-in that helps you understand how you've been feeling.",
    href: "/register",
  },
  {
    title: "Verified doctors",
    text: "Book psychiatrists and psychologists for online text or in-person sessions.",
    href: "/doctors",
  },
  {
    title: "Free resources",
    text: "Articles and answers on anxiety, sleep, relationships and more.",
    href: "/resources",
  },
];

export default function Home() {
  return (
    <>
      {/* Always dark, like an evening scene, whatever the site theme. */}
      <section className="relative isolate overflow-hidden bg-[#121a19] text-[#e6ecea]">
        <HeroArt className="absolute inset-y-0 right-0 -z-10 h-full w-full opacity-60 md:w-[70%] md:opacity-100" />
        {/* Keeps the text readable where it overlaps the artwork. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-linear-to-r from-[#121a19] via-[#121a19]/85 to-[#121a19]/0 md:via-[#121a19]/60"
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-20 sm:py-28 lg:py-36">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#5bb3a7]">
            AI &amp; expert support for mental health
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            A calm place to talk, reflect, and find the right help.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[#a7b4b2] sm:text-xl">
            Chat with a supportive AI companion any time, check in with a self-assessment, and book
            verified mental-health professionals when you need more.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-[#5bb3a7] px-5 py-3 text-base font-medium text-white transition-colors hover:bg-[#74c2b7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5bb3a7]"
            >
              Create a free account
            </Link>
            <Link
              href="/doctors"
              className="inline-flex items-center justify-center rounded-lg border border-[#2b3634] bg-[#1a2221] px-5 py-3 text-base font-medium text-[#e6ecea] transition-colors hover:border-[#5bb3a7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5bb3a7]"
            >
              Browse doctors
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-16">

      <section aria-labelledby="services" className="flex flex-col gap-6">
        <h2 id="services" className="text-2xl font-semibold">
          How MindEase Oasis helps
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <Link key={s.title} href={s.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <h3 className="font-medium">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="latest" className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="latest" className="text-2xl font-semibold">
            From our resources
          </h2>
          <Link href="/resources" className="text-sm font-medium text-primary hover:underline">
            All articles
          </Link>
        </div>
        <Suspense fallback={<p className="text-sm text-muted">Loading articles…</p>}>
          <LatestArticles />
        </Suspense>
      </section>

      <section
        aria-labelledby="emergency"
        className="flex flex-col gap-4 rounded-2xl bg-warning-soft p-6"
      >
        <h2 id="emergency" className="text-2xl font-semibold">
          Need help right now?
        </h2>
        <p className="text-sm">
          If you or someone else is in immediate danger, call emergency services now.
        </p>
        <Suspense fallback={<HotlineList hotlines={FALLBACK_HOTLINES} />}>
          <Hotlines />
        </Suspense>
      </section>
      </div>
    </>
  );
}

async function LatestArticles() {
  let posts: BlogSummary[];
  try {
    posts = (await serverApi<BlogSummary[]>("/content/blogs")).slice(0, 3);
  } catch {
    return <p className="text-sm text-muted">Articles are unavailable right now.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {posts.map((p) => (
        <Link key={p.slug} href={`/resources/${p.slug}`} className="group">
          <Card className="h-full transition-colors group-hover:border-primary">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{p.category}</p>
            <h3 className="mt-2 font-medium">{p.title}</h3>
            {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted">{p.excerpt}</p>}
          </Card>
        </Link>
      ))}
    </div>
  );
}
