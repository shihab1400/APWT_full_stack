import type { Hotline } from "@mindease/shared";
import { FALLBACK_HOTLINES } from "@/lib/fallback-hotlines";
import { serverApi } from "@/lib/server-api";

export { FALLBACK_HOTLINES };

export async function loadHotlines(): Promise<Hotline[]> {
  try {
    const lines = await serverApi<Hotline[]>("/content/hotlines");
    return lines.length ? lines : FALLBACK_HOTLINES;
  } catch {
    return FALLBACK_HOTLINES;
  }
}

export function HotlineList({ hotlines }: { hotlines: Hotline[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {hotlines.map((h) => (
        <li key={h.id} className="rounded-xl border border-border bg-surface p-4">
          <p className="font-medium">{h.name}</p>
          <a
            href={`tel:${h.number.replace(/[^\d+]/g, "")}`}
            className="mt-1 inline-block text-2xl font-semibold text-danger hover:underline"
          >
            {h.number}
          </a>
          {h.availability && <p className="text-xs text-muted">{h.availability}</p>}
          {h.description && <p className="mt-2 text-sm text-muted">{h.description}</p>}
        </li>
      ))}
    </ul>
  );
}

export async function Hotlines() {
  return <HotlineList hotlines={await loadHotlines()} />;
}
