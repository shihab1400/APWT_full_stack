import Link from "next/link";
import { Suspense } from "react";
import type { BlogSummary } from "@mindease/shared";
import { FALLBACK_HOTLINES, Hotlines, HotlineList } from "@/components/hotlines";
import { ButtonLink, Card } from "@/components/ui";
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
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-6 py-8">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          AI &amp; expert support for mental health
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          A calm place to talk, reflect, and find the right help.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Chat with a supportive AI companion any time, check in with a self-assessment, and book
          verified mental-health professionals when you need more.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/register">Create a free account</ButtonLink>
          <ButtonLink href="/doctors" variant="secondary">
            Browse doctors
          </ButtonLink>
        </div>
      </section>

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
