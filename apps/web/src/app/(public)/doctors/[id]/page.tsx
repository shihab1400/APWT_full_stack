import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { PublicDoctor, PublicReview } from "@mindease/shared";
import { Rating, formatBdt } from "@/components/doctor-card";
import { ButtonLink, Card } from "@/components/ui";
import { formatDay } from "@/lib/datetime";
import { serverApi } from "@/lib/server-api";
import { peekSession } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DoctorProfilePage(props: PageProps<"/doctors/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/doctors" className="text-sm text-primary hover:underline">
        ← All doctors
      </Link>
      <Suspense fallback={<p className="text-sm text-muted">Loading profile…</p>}>
        <DoctorProfile params={props.params} />
      </Suspense>
    </div>
  );
}

async function DoctorProfile({ params }: Pick<PageProps<"/doctors/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const doctor = await serverApi<PublicDoctor>(`/doctors/${id}`);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <title>{`${doctor.name} · MindEase Oasis`}</title>
      <Card className="flex flex-col gap-4 lg:col-span-2">
        <div>
          <h1 className="text-3xl font-semibold">{doctor.name}</h1>
          <p className="mt-1 text-muted">{doctor.specialization ?? "Mental health professional"}</p>
        </div>
        <Rating doctor={doctor} />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {doctor.qualifications && (
            <div>
              <dt className="text-muted">Qualifications</dt>
              <dd className="font-medium">{doctor.qualifications}</dd>
            </div>
          )}
          {doctor.experienceYears != null && (
            <div>
              <dt className="text-muted">Experience</dt>
              <dd className="font-medium">{doctor.experienceYears} years</dd>
            </div>
          )}
        </dl>
        {doctor.bio && (
          <section>
            <h2 className="font-medium">About</h2>
            <p className="mt-2 leading-7 text-muted">{doctor.bio}</p>
          </section>
        )}
      </Card>

      <Card className="flex h-fit flex-col gap-4">
        <div>
          <p className="text-sm text-muted">Consultation fee</p>
          <p className="text-2xl font-semibold">{formatBdt(doctor.fee)}</p>
          <p className="mt-1 text-xs text-muted">Online (text chat) or in person</p>
        </div>
        <BookingAction doctorId={doctor.id} />
      </Card>

      <section aria-labelledby="reviews" className="flex flex-col gap-3 lg:col-span-2">
        <h2 id="reviews" className="text-lg font-semibold">
          Patient reviews
        </h2>
        <Suspense fallback={<p className="text-sm text-muted">Loading reviews…</p>}>
          <Reviews doctorId={doctor.id} />
        </Suspense>
      </section>
    </div>
  );
}

async function Reviews({ doctorId }: { doctorId: string }) {
  const reviews = await serverApi<PublicReview[]>(`/doctors/${doctorId}/reviews`);
  if (!reviews.length) {
    return <p className="text-sm text-muted">No reviews yet. Patients can rate a doctor after a completed session.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((r) => (
        <li key={r.id}>
          <Card className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-amber-500" role="img" aria-label={`${r.rating} out of 5 stars`}>
                {"★".repeat(r.rating)}
                <span className="text-border">{"★".repeat(5 - r.rating)}</span>
              </span>
              <span className="text-muted">Verified patient · {formatDay(r.createdAt)}</span>
            </div>
            {r.comment && <p className="text-sm leading-6">{r.comment}</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}

async function BookingAction({ doctorId }: { doctorId: string }) {
  const session = await peekSession();
  if (!session.signedIn) {
    return (
      <>
        <ButtonLink href={`/login?next=/doctors/${doctorId}`}>Log in to book</ButtonLink>
        <p className="text-xs text-muted">
          New here?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create a free account
          </Link>
        </p>
      </>
    );
  }
  if (session.role === "DOCTOR" || session.role === "ADMIN") {
    return <p className="text-xs text-muted">Patients book from their account.</p>;
  }
  return (
    <>
      <ButtonLink href={`/dashboard/book/${doctorId}`}>See times and book</ButtonLink>
      <p className="text-xs text-muted">Booking is included with Premium.</p>
    </>
  );
}
