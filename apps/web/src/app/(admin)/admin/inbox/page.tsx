"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { ADMIN_NAV } from "../nav";

interface ContactMessageRow {
  id: string;
  reference: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  handled: boolean;
  createdAt: string;
}

const KEY = ["admin", "contact-messages"];

export default function AdminInbox() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Inbox />}</AppShell>;
}

function Inbox() {
  const qc = useQueryClient();
  const messages = useQuery({
    queryKey: KEY,
    queryFn: () => api<ContactMessageRow[]>("/admin/contact-messages"),
  });
  const setHandled = useMutation({
    mutationFn: (v: { id: string; handled: boolean }) =>
      api(`/admin/contact-messages/${v.id}`, { method: "PATCH", body: { handled: v.handled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const open = messages.data?.filter((m) => !m.handled).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Support inbox</h1>
        {messages.data && <p className="text-sm text-muted">{open} open</p>}
      </div>
      {setHandled.error && <Alert>{setHandled.error.message}</Alert>}
      {messages.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : messages.error ? (
        <Alert>{messages.error.message}</Alert>
      ) : messages.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No messages yet.</p>
        </Card>
      ) : (
        messages.data.map((m) => (
          <Card key={m.id} className={`flex flex-col gap-2 ${m.handled ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{m.subject || "(no subject)"}</p>
                <p className="text-sm text-muted">
                  {m.name} · <a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a> ·{" "}
                  {new Date(m.createdAt).toLocaleString()} · <span className="font-mono">{m.reference}</span>
                </p>
              </div>
              <Button
                variant={m.handled ? "ghost" : "secondary"}
                disabled={setHandled.isPending}
                onClick={() => setHandled.mutate({ id: m.id, handled: !m.handled })}
              >
                {m.handled ? "Reopen" : "Mark handled"}
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6">{m.message}</p>
          </Card>
        ))
      )}
    </div>
  );
}
