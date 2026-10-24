"use client";

import Link from "next/link";
import type { DoctorSelfProfile } from "@mindease/shared";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/datetime";

/** Where the doctor is in verification, and what to do next. */
export function ProfileStatus({ profile, showLink }: { profile: DoctorSelfProfile; showLink?: boolean }) {
  const link = showLink && (
    <Link href="/doctor/profile" className="font-medium text-primary hover:underline">
      Go to your profile
    </Link>
  );
  switch (profile.status) {
    case "APPROVED":
      return (
        <Card className="bg-primary-soft">
          <h2 className="font-medium text-primary">✓ Verified</h2>
          <p className="mt-1 text-sm">
            Your profile is public in the doctor directory. Patients can book your open slots.
          </p>
        </Card>
      );
    case "SUBMITTED":
      return (
        <Card className="bg-warning-soft">
          <h2 className="font-medium">Waiting for verification</h2>
          <p className="mt-1 text-sm text-muted">
            Submitted {profile.submittedAt && formatDateTime(profile.submittedAt)}. An admin is
            reviewing your credentials. You&apos;ll be notified when it&apos;s done. Meanwhile you
            can set your weekly hours.
          </p>
        </Card>
      );
    case "REJECTED":
      return (
        <Card className="bg-danger-soft">
          <h2 className="font-medium text-danger">Changes needed</h2>
          <p className="mt-1 text-sm">{profile.rejectReason}</p>
          <p className="mt-2 text-sm text-muted">Update your profile or licence, then submit it again. {link}</p>
        </Card>
      );
    default:
      return (
        <Card className="bg-warning-soft">
          <h2 className="font-medium">Complete your profile</h2>
          <p className="mt-1 text-sm text-muted">
            Patients can&apos;t see or book you until an admin verifies your credentials. Still
            needed: {profile.missing.join(", ") || "nothing, submit it for review"}. {link}
          </p>
        </Card>
      );
  }
}
