import type { Hotline } from "@mindease/shared";

/** Shown whenever we detect someone may be at risk. Numbers are tap-to-call. */
export function CrisisCard({ hotlines, children }: { hotlines: Hotline[]; children?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4">
      <p className="font-medium text-danger">You don&apos;t have to go through this alone</p>
      {children ?? (
        <p className="text-sm">
          If you are in danger or thinking about ending your life, please reach out right now. Help
          is free and available 24/7.
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {hotlines.map((h) => (
          <li key={h.id}>
            <a
              href={`tel:${h.number.replace(/[^\d+]/g, "")}`}
              className="flex flex-col rounded-xl bg-surface px-3 py-2 text-sm shadow-sm hover:underline"
            >
              <span className="text-muted">{h.name}</span>
              <span className="text-lg font-semibold text-danger">{h.number}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
