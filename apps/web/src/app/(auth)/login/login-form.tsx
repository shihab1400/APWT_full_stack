"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DASHBOARD_BY_ROLE, loginSchema } from "@mindease/shared";
import { Alert, Button, Card, Field } from "@/components/ui";
import { useLogin } from "@/lib/auth";
import { apiFormErrors, safeNext, zodFieldErrors, type FieldErrors } from "@/lib/forms";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});

    try {
      const user = await login.mutateAsync(parsed.data);
      router.replace(safeNext(params.get("next")) ?? DASHBOARD_BY_ROLE[user.role]);
    } catch (err) {
      const { fields, message } = apiFormErrors(err);
      setErrors(fields);
      setFormError(message);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Log in to continue to your space.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
