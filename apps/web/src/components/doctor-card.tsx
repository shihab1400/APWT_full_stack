import Link from "next/link";
import type { PublicDoctor } from "@mindease/shared";
import { Card } from "@/components/ui";

export const formatBdt = (amount: number) => `${amount.toLocaleString("en-US")} BDT`;

export function Rating({ doctor }: { doctor: PublicDoctor }) {
  if (doctor.rating == null) return <span className="text-sm text-muted">No reviews yet</span>;
  return (
    <span className="text-sm">
      <span aria-hidden className="text-amber-500">★</span>{" "}
      <strong>{doctor.rating.toFixed(1)}</strong>{" "}
      <span className="text-muted">
        ({doctor.reviewCount} review{doctor.reviewCount === 1 ? "" : "s"})
      </span>
    </span>
  );
}

export function DoctorCard({ doctor }: { doctor: PublicDoctor }) {
  return (
    <Link href={`/doctors/${doctor.id}`} className="group">
      <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-primary">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary"
          >
            {initials(doctor.name)}
          </span>
          <div>
            <h2 className="font-medium">{doctor.name}</h2>
            <p className="text-sm text-muted">{doctor.specialization ?? "Mental health professional"}</p>
          </div>
        </div>
        <Rating doctor={doctor} />
        {doctor.bio && <p className="line-clamp-3 text-sm text-muted">{doctor.bio}</p>}
        <p className="mt-auto text-sm">
          Consultation fee: <strong>{formatBdt(doctor.fee)}</strong>
        </p>
      </Card>
    </Link>
  );
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
