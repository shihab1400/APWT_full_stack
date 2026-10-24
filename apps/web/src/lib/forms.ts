import { z } from "zod";
import { ApiError } from "./api";

export type FieldErrors = Record<string, string | undefined>;

/** First message per field from a client-side Zod failure. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0]]));
}

/** Splits an API failure into per-field errors and a form-level message. */
export function apiFormErrors(err: unknown): { fields: FieldErrors; message?: string } {
  if (err instanceof ApiError) {
    const fields = Object.fromEntries(
      Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]]),
    );
    return { fields, message: Object.keys(fields).length ? undefined : err.message };
  }
  return { fields: {}, message: "Something went wrong. Please try again." };
}

/** Only allow same-site relative redirects from a ?next= parameter. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
