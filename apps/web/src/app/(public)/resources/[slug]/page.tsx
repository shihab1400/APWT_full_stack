import Link from "next/link";
import { Suspense } from "react";
import type { BlogPostDetail } from "@mindease/shared";
import { Prose } from "@/components/prose";
import { ButtonLink } from "@/components/ui";
import { serverApi } from "@/lib/server-api";

export default function ArticlePage(props: PageProps<"/resources/[slug]">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link href="/resources" className="text-sm text-primary hover:underline">
        ← All resources
      </Link>
      <Suspense fallback={<p className="text-sm text-muted">Loading article…</p>}>
        <Article params={props.params} />
      </Suspense>
    </div>
  );
}

async function Article({ params }: Pick<PageProps<"/resources/[slug]">, "params">) {
  const { slug } = await params;
  const post = await serverApi<BlogPostDetail>(`/content/blogs/${encodeURIComponent(slug)}`);
  const date = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-GB", { dateStyle: "long" })
    : null;

  return (
    <article className="flex flex-col gap-6">
      <title>{`${post.title} · MindEase Oasis`}</title>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{post.category}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">{post.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {[post.authorName, date, `${post.readMinutes} min read`].filter(Boolean).join(" · ")}
        </p>
      </header>
      <Prose source={post.body} />
      <aside className="mt-4 flex flex-col gap-3 rounded-2xl bg-primary-soft p-6">
        <p className="font-medium">Want to talk it through?</p>
        <p className="text-sm text-muted">
          Our AI companion is available any time, and verified doctors are here when you need
          more support.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/register">Get started free</ButtonLink>
          <ButtonLink href="/doctors" variant="secondary">
            Find a doctor
          </ButtonLink>
        </div>
      </aside>
    </article>
  );
}
