import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { BlogSummary } from "@mindease/shared";
import { Card } from "@/components/ui";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage(props: PageProps<"/resources">) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Mental health resources</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Practical, plain-language articles on looking after your mind. Free to read, no account
          needed.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading articles…</p>}>
        <ArticleList searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function ArticleList({ searchParams }: Pick<PageProps<"/resources">, "searchParams">) {
  const { category } = await searchParams;
  const active = typeof category === "string" ? category : "";
  const all = await serverApi<BlogSummary[]>("/content/blogs");
  const categories = [...new Set(all.map((p) => p.category))].sort();
  const posts = active ? all.filter((p) => p.category === active) : all;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {["", ...categories].map((c) => (
          <Link
            key={c || "all"}
            href={c ? `/resources?category=${encodeURIComponent(c)}` : "/resources"}
            aria-current={c === active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              c === active
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {c || "All"}
          </Link>
        ))}
      </nav>
      {posts.length === 0 ? (
        <p className="text-muted">No articles in this category yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <Link key={p.slug} href={`/resources/${p.slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {p.category} · {p.readMinutes} min read
                </p>
                <h2 className="mt-2 text-lg font-medium">{p.title}</h2>
                {p.excerpt && <p className="mt-2 text-sm text-muted">{p.excerpt}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
