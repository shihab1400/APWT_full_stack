"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DASHBOARD_BY_ROLE, registerSchema } from "@mindease/shared";
import { Alert, Button, Card, Field } from "@/components/ui";
import { useRegister } from "@/lib/auth";
import { apiFormErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";

type AccountType = "USER" | "DOCTOR";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const register = useRegister();
  const [role, setRole] = useState<AccountType>(
    params.get("role") === "DOCTOR" ? "DOCTOR" : "USER",
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const form = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      role,
      consent: form.get("consent") === "on",
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});

    try {
      const user = await register.mutateAsync(parsed.data);
      router.replace(DASHBOARD_BY_ROLE[user.role]);
    } catch (err) {
      const { fields, message } = apiFormErrors(err);
      setErrors(fields);
      setFormError(message);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Free to start. Your conversations stay private.</p>

      <div role="radiogroup" aria-label="Account type" className="mt-6 grid grid-cols-2 gap-2">
        {(
          [
            ["USER", "I'm seeking support"],
            ["DOCTOR", "I'm a professional"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => setRole(value)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              role === value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        {role === "DOCTOR" && (
          <Alert tone="info">
            Doctor profiles stay hidden until an admin verifies your credentials.
          </Alert>
        )}
        <Field id="name" name="name" label="Full name" autoComplete="name" error={errors.name} />
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          error={errors.password}
        />
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-0.5 accent-[var(--primary)]" />
            <span>
              I agree to the privacy policy and consent to my data being stored to provide this
              service.
            </span>
          </label>
          {errors.consent && <p className="text-xs text-danger">{errors.consent}</p>}
        </div>
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
