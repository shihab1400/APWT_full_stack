export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      </header>
      {sections.map((s) => (
        <section key={s.heading} className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{s.heading}</h2>
          <ul className="ml-5 list-disc space-y-2 leading-7 text-muted">
            {s.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
