import type { Metadata } from "next";
import { Suspense } from "react";
import type { PublicDoctor } from "@mindease/shared";
import { DoctorCard } from "@/components/doctor-card";
import { Button } from "@/components/ui";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Find a doctor" };

export default function DoctorsPage(props: PageProps<"/doctors">) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Find a doctor</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Every professional listed here has had their qualifications and licence checked by our
          team. Create a free account to book an online (text) or in-person consultation.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading doctors…</p>}>
        <DoctorResults searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function DoctorResults({ searchParams }: Pick<PageProps<"/doctors">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const specialization = typeof params.specialization === "string" ? params.specialization : "";

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (specialization) query.set("specialization", specialization);

  const [doctors, specializations] = await Promise.all([
    serverApi<PublicDoctor[]>(`/doctors?${query}`),
    serverApi<string[]>("/doctors/specializations"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* A plain GET form: filtering works without client JavaScript. */}
      <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or specialization"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:w-60">
          Specialization
          <select
            name="specialization"
            defaultValue={specialization}
            className="rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-primary"
          >
            <option value="">All</option>
            {specializations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {doctors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
          No doctors match your search.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} />
          ))}
        </div>
      )}
    </div>
  );
}
