"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, When } from "@/components/appointment-parts";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { dhakaDateKey } from "@/lib/datetime";
import { useNow } from "@/lib/use-now";
import { DOCTOR_NAV } from "./nav";
import { ProfileStatus } from "./profile-status";
import { useDoctorAppointments, useDoctorProfile } from "./queries";

export default function DoctorDashboard() {
  return (
    <AppShell role="DOCTOR" nav={DOCTOR_NAV}>
      {(user) => (
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
          <Status />
          <Upcoming />
        </div>
      )}
    </AppShell>
  );
}

function Status() {
  const profile = useDoctorProfile();
  if (profile.isPending) return null;
  if (profile.error) return <Alert>{profile.error.message}</Alert>;
  return <ProfileStatus profile={profile.data} showLink />;
}

function Upcoming() {
  const list = useDoctorAppointments();
  const now = useNow();
  if (list.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (list.error) return <Alert>{list.error.message}</Alert>;

  const today = dhakaDateKey(new Date(now).toISOString());
  const requests = list.data.filter((a) => a.status === "REQUESTED");
  const confirmed = list.data.filter((a) => a.status === "ACCEPTED" && Date.parse(a.endsAt) > now);
  const todayCount = confirmed.filter((a) => dhakaDateKey(a.startsAt) === today).length;
  const next = [...requests, ...confirmed]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 3);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Requests waiting" value={requests.length} href="/doctor/appointments" />
        <Stat label="Sessions today" value={todayCount} href="/doctor/appointments" />
        <Stat label="Confirmed upcoming" value={confirmed.length} href="/doctor/appointments" />
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="next">
        <div className="flex items-center justify-between">
          <h2 id="next" className="text-lg font-semibold">
            Coming up
          </h2>
          <ButtonLink href="/doctor/schedule" variant="secondary">
            Edit schedule
          </ButtonLink>
        </div>
        {next.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nothing booked yet.</p>
          </Card>
        ) : (
          next.map((a) => (
            <Card key={a.id} className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{a.patient.name}</p>
                <StatusBadge status={a.status} />
              </div>
              <When appointment={a} />
            </Card>
          ))
        )}
      </section>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="transition-colors group-hover:border-primary">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-3xl font-semibold">{value}</p>
      </Card>
    </Link>
  );
}
