"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { meQueryKey } from "@/lib/auth";

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const qc = useQueryClient();
  const result = useQuery({
    queryKey: ["verify-email", token],
    queryFn: () => api<{ verified: true }>(`/auth/verify-email?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (result.isSuccess) void qc.invalidateQueries({ queryKey: meQueryKey });
  }, [result.isSuccess, qc]);

  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Email verification</h1>
      {!token ? (
        <Alert>This link is missing its token.</Alert>
      ) : result.isPending ? (
        <p className="text-sm text-muted">Verifying…</p>
      ) : result.isError ? (
        <Alert>{result.error.message}</Alert>
      ) : (
        <Alert tone="info">Your email is verified. Thank you!</Alert>
      )}
      <ButtonLink href="/login" variant="secondary">
        Continue
      </ButtonLink>
    </Card>
  );
}
