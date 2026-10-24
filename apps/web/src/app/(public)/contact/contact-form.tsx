"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { contactSchema, type ContactInput, type ContactReceipt } from "@mindease/shared";
import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { apiFormErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";

export function ContactForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const send = useMutation({
    mutationFn: (dto: ContactInput) =>
      api<ContactReceipt>("/contact", { method: "POST", body: dto }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const form = new FormData(e.currentTarget);
    const parsed = contactSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      subject: (form.get("subject") as string) || undefined,
      message: form.get("message"),
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});

    try {
      await send.mutateAsync(parsed.data);
    } catch (err) {
      const { fields, message } = apiFormErrors(err);
      setErrors(fields);
      setFormError(message);
    }
  }

  if (send.isSuccess) {
    return (
      <Card className="flex flex-col gap-3" role="status">
        <h2 className="text-xl font-semibold">Thank you, we&apos;ve received your message</h2>
        <p className="text-muted">
          Your reference number is{" "}
          <strong className="font-mono text-foreground">{send.data.reference}</strong>. Please
          keep it in case you need to follow up.
        </p>
        <Button variant="secondary" className="w-fit" onClick={() => send.reset()}>
          Send another message
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" name="name" label="Your name" autoComplete="name" error={errors.name} />
          <Field id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
        </div>
        <Field id="subject" name="subject" label="Subject (optional)" error={errors.subject} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="message" className="text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={6}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "message-error" : undefined}
            className={`rounded-lg border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${
              errors.message ? "border-danger" : "border-border"
            }`}
          />
          {errors.message && (
            <p id="message-error" className="text-xs text-danger">
              {errors.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={send.isPending} className="w-fit">
          {send.isPending ? "Sending…" : "Send message"}
        </Button>
      </form>
    </Card>
  );
}
