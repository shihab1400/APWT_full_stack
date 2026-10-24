"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  DOCTOR_FEE_MAX,
  DOCTOR_FEE_MIN,
  LICENSE_MAX_BYTES,
  doctorProfileSchema,
  type DoctorProfileDto,
  type DoctorSelfProfile,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Field, TextArea } from "@/components/ui";
import { api } from "@/lib/api";
import { apiFormErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { DOCTOR_NAV } from "../nav";
import { ProfileStatus } from "../profile-status";
import { profileKey, useDoctorProfile } from "../queries";

export default function DoctorProfilePage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Profile />}</AppShell>;
}

function Profile() {
  const profile = useDoctorProfile();
  if (profile.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (profile.error) return <Alert>{profile.error.message}</Alert>;
  const p = profile.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Professional profile</h1>
        <p className="text-sm text-muted">
          Patients see these details once you&apos;re verified. Your licence is only shown to admins.
        </p>
      </div>
      <ProfileStatus profile={p} />
      <DetailsForm profile={p} />
      <LicenseCard profile={p} />
      <SubmitCard profile={p} />
    </div>
  );
}

function DetailsForm({ profile: p }: { profile: DoctorSelfProfile }) {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const save = useMutation({
    mutationFn: (dto: DoctorProfileDto) =>
      api<DoctorSelfProfile>("/doctor/profile", { method: "PUT", body: dto }),
    onSuccess: (data) => qc.setQueryData(profileKey, data),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const form = new FormData(e.currentTarget);
    const number = (name: string) => (form.get(name) === "" ? NaN : Number(form.get(name)));
    const parsed = doctorProfileSchema.safeParse({
      specialization: form.get("specialization"),
      qualifications: form.get("qualifications"),
      experienceYears: number("experienceYears"),
      fee: number("fee"),
      bio: form.get("bio"),
      clinicAddress: form.get("clinicAddress"),
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    try {
      await save.mutateAsync(parsed.data);
    } catch (err) {
      const { fields, message } = apiFormErrors(err);
      setErrors(fields);
      setFormError(message);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <h2 className="font-medium">Details</h2>
        {formError && <Alert>{formError}</Alert>}
        {save.isSuccess && !save.isPending && <Alert tone="info">Saved.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="specialization"
            name="specialization"
            label="Specialization"
            placeholder="e.g. Psychiatrist"
            defaultValue={p.specialization ?? ""}
            error={errors.specialization}
          />
          <Field
            id="qualifications"
            name="qualifications"
            label="Qualifications"
            placeholder="e.g. MBBS, FCPS (Psychiatry)"
            defaultValue={p.qualifications ?? ""}
            error={errors.qualifications}
          />
          <Field
            id="experienceYears"
            name="experienceYears"
            type="number"
            min={0}
            max={60}
            label="Years of experience"
            defaultValue={p.experienceYears ?? ""}
            error={errors.experienceYears}
          />
          <Field
            id="fee"
            name="fee"
            type="number"
            min={DOCTOR_FEE_MIN}
            max={DOCTOR_FEE_MAX}
            label="Consultation fee (BDT)"
            hint={`Between ${DOCTOR_FEE_MIN} and ${DOCTOR_FEE_MAX.toLocaleString("en-US")} BDT per session`}
            defaultValue={p.fee >= DOCTOR_FEE_MIN ? p.fee : ""}
            error={errors.fee}
          />
        </div>
        <TextArea
          id="bio"
          name="bio"
          label="About your practice"
          rows={5}
          defaultValue={p.bio ?? ""}
          hint="Who you work with and how. At least 30 characters."
          error={errors.bio}
        />
        <Field
          id="clinicAddress"
          name="clinicAddress"
          label="Clinic address for in-person sessions (optional)"
          hint="Leave empty to offer online (text) sessions only."
          defaultValue={p.clinicAddress ?? ""}
          error={errors.clinicAddress}
        />
        <Button type="submit" className="w-fit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save details"}
        </Button>
      </form>
    </Card>
  );
}

function LicenseCard({ profile: p }: { profile: DoctorSelfProfile }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<DoctorSelfProfile>("/doctor/profile/license", { method: "POST", body });
    },
    onSuccess: (data) => {
      qc.setQueryData(profileKey, data);
      if (input.current) input.current.value = "";
    },
    onError: (err) => setError(err.message),
  });
  const locked = p.status === "APPROVED";

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Licence or registration certificate</h2>
      {p.hasLicense ? (
        <p className="text-sm">
          ✓ Uploaded ({p.licenseMimeType === "application/pdf" ? "PDF" : "image"}).{" "}
          <a href="/api/doctor/profile/license" target="_blank" rel="noopener" className="text-primary hover:underline">
            View file
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">Not uploaded yet.</p>
      )}
      {locked ? (
        <p className="text-sm text-muted">Your licence is verified. Contact support if it needs to change.</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            const file = input.current?.files?.[0];
            if (!file) return setError("Choose a file first");
            if (file.size > LICENSE_MAX_BYTES) return setError("The file must be 5 MB or smaller");
            upload.mutate(file);
          }}
        >
          <label htmlFor="license" className="text-sm text-muted">
            PDF, PNG or JPG, up to 5 MB. Only admins can see it.
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              id="license"
              type="file"
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
              className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            />
            <Button type="submit" variant="secondary" disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : p.hasLicense ? "Replace file" : "Upload"}
            </Button>
          </div>
          {error && <Alert>{error}</Alert>}
        </form>
      )}
    </Card>
  );
}

function SubmitCard({ profile: p }: { profile: DoctorSelfProfile }) {
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () => api<DoctorSelfProfile>("/doctor/profile/submit", { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(profileKey, data),
  });
  if (p.status === "APPROVED" || p.status === "SUBMITTED") return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Submit for verification</h2>
      <p className="text-sm text-muted">
        {p.missing.length
          ? `Before submitting, add: ${p.missing.join(", ")}.`
          : "Everything is in place. An admin will review your credentials and you'll be notified of the result."}
      </p>
      {submit.error && <Alert>{submit.error.message}</Alert>}
      <Button className="w-fit" disabled={p.missing.length > 0 || submit.isPending} onClick={() => submit.mutate()}>
        {submit.isPending ? "Submitting…" : p.status === "REJECTED" ? "Submit again" : "Submit for review"}
      </Button>
    </Card>
  );
}
