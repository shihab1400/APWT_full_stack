"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONSULTATION_MESSAGE_MAX,
  CONSULTATION_OPENS_MINUTES_BEFORE,
  type ConsultationMessageItem,
  type ConsultationSummary,
  type ConsultationThread,
  type ConsultationUnread,
  type ConsultationWindow,
  type Hotline,
} from "@mindease/shared";
import { CrisisCard } from "@/components/crisis-card";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatTime, timeAgo } from "@/lib/datetime";
import { FALLBACK_HOTLINES } from "@/lib/fallback-hotlines";
import { useNow } from "@/lib/use-now";

/** Total unread consultation messages, for the nav badge. */
export function useUnreadMessages() {
  return useQuery({
    queryKey: ["consultations", "unread"],
    queryFn: () => api<ConsultationUnread>("/consultations/unread"),
    // The live stream normally refreshes this; polling covers a dropped connection.
    refetchInterval: 60_000,
  });
}

export function UnreadBadge() {
  const unread = useUnreadMessages();
  const total = unread.data?.total ?? 0;
  if (!total) return null;
  return (
    <span className="ml-1.5 inline-grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4.5 text-white">
      <span className="sr-only">, </span>
      {total > 9 ? "9+" : total}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/** The window as of the viewer's clock, so a chat opens without a refresh. */
function liveWindow(c: ConsultationSummary, now: number): ConsultationWindow {
  if (c.status !== "ACCEPTED" || now >= Date.parse(c.closesAt)) return "CLOSED";
  return now < Date.parse(c.opensAt) ? "UPCOMING" : "OPEN";
}

/**
 * Messages page for either side: the list of online sessions and the open
 * conversation. `basePath` is /dashboard/messages or /doctor/messages.
 */
export function Consultations({ selectedId, basePath }: { selectedId: string | null; basePath: string }) {
  const list = useQuery({
    queryKey: ["consultations", "list"],
    queryFn: () => api<ConsultationSummary[]>("/consultations"),
  });
  const now = useNow(30_000);

  if (list.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (list.error) return <Alert>{list.error.message}</Alert>;
  const selected = selectedId ?? list.data.find((c) => liveWindow(c, now) === "OPEN")?.appointmentId ?? list.data[0]?.appointmentId;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-muted">
          Private text consultations for online sessions. Each chat opens {CONSULTATION_OPENS_MINUTES_BEFORE} minutes
          before the session and becomes read-only an hour after it ends.
        </p>
      </div>
      {list.data.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No online sessions yet. Chats appear here once an online appointment is confirmed.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Conversations" className="flex flex-col gap-2">
            {list.data.map((c) => {
              const w = liveWindow(c, now);
              const active = c.appointmentId === selected;
              return (
                <Link
                  key={c.appointmentId}
                  href={`${basePath}?appointment=${c.appointmentId}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    active ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.counterpart.name}</span>
                    {c.unreadCount > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(c.startsAt)} ·{" "}
                    <span className={w === "OPEN" ? "font-medium text-primary" : ""}>
                      {w === "OPEN" ? "Open now" : w === "UPCOMING" ? "Upcoming" : "Ended"}
                    </span>
                  </span>
                  {c.lastMessage && (
                    <span className="truncate text-xs text-muted">
                      {c.lastMessage.mine ? "You: " : ""}
                      {c.lastMessage.body}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          {selected && <Thread key={selected} appointmentId={selected} />}
        </div>
      )}
    </div>
  );
}

function Thread({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const thread = useQuery({
    queryKey: ["consultations", "thread", appointmentId],
    queryFn: () => api<ConsultationThread>(`/consultations/${appointmentId}`),
    // Live events refetch this; a slow poll covers a dropped stream.
    refetchInterval: 20_000,
  });
  const hotlines = useQuery({
    queryKey: ["content", "hotlines"],
    queryFn: () => api<Hotline[]>("/content/hotlines"),
    enabled: thread.data?.myRole === "PATIENT" && thread.data.messages.some((m) => m.flagged),
  });
  const bottom = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (thread.isPending) return <Card className="text-sm text-muted">Loading…</Card>;
  if (thread.error) return <Alert>{thread.error.message}</Alert>;
  const t = thread.data;
  const state = liveWindow(t, now);
  const lastMineRead = [...t.messages].reverse().find((m) => m.senderId !== t.counterpart.id)?.readAt;

  return (
    <Card className="flex min-h-[28rem] flex-col gap-3 p-0">
      <header className="border-b border-border px-4 py-3">
        <p className="font-medium">{t.counterpart.name}</p>
        <p className="text-xs text-muted">
          Session {formatDateTime(t.startsAt)} – {formatTime(t.endsAt)} ·{" "}
          {state === "OPEN"
            ? `open until ${formatTime(t.closesAt)}`
            : state === "UPCOMING"
              ? `chat opens ${formatDateTime(t.opensAt)}`
              : "ended, read-only"}
        </p>
      </header>

      <div className="flex max-h-[32rem] flex-1 flex-col gap-2 overflow-y-auto px-4" aria-live="polite">
        {t.messages.length === 0 && (
          <p className="my-auto text-center text-sm text-muted">
            {state === "UPCOMING"
              ? "You can start writing when the chat opens."
              : state === "OPEN"
                ? "Say hello to start the session."
                : "No messages in this session."}
          </p>
        )}
        {t.messages.map((m) => (
          <Bubble key={m.id} message={m} mine={m.senderId !== t.counterpart.id} myRole={t.myRole} hotlines={hotlines.data} />
        ))}
        {lastMineRead && t.messages.at(-1)?.senderId !== t.counterpart.id && (
          <p className="self-end text-[11px] text-muted">Seen {timeAgo(lastMineRead)}</p>
        )}
        <div ref={bottom} />
      </div>

      <Composer
        appointmentId={appointmentId}
        state={state}
        onSent={(m) =>
          qc.setQueryData<ConsultationThread>(["consultations", "thread", appointmentId], (old) =>
            old && !old.messages.some((x) => x.id === m.id) ? { ...old, messages: [...old.messages, m] } : old,
          )
        }
      />
    </Card>
  );
}

function Bubble({
  message: m,
  mine,
  myRole,
  hotlines,
}: {
  message: ConsultationMessageItem;
  mine: boolean;
  myRole: "PATIENT" | "DOCTOR";
  hotlines?: Hotline[];
}) {
  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${mine ? "self-end items-end" : "self-start items-start"}`}>
      <p
        className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${
          mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-background"
        }`}
      >
        {m.body}
      </p>
      <span className="text-[11px] text-muted">{formatTime(m.createdAt)}</span>
      {m.flagged && myRole === "DOCTOR" && (
        <span className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger">
          ⚠ Crisis language detected. The patient was shown emergency hotlines.
        </span>
      )}
      {m.flagged && myRole === "PATIENT" && (
        <div className="w-full max-w-md self-stretch">
          <CrisisCard hotlines={hotlines?.length ? hotlines : FALLBACK_HOTLINES} />
        </div>
      )}
    </div>
  );
}

function Composer({
  appointmentId,
  state,
  onSent,
}: {
  appointmentId: string;
  state: ConsultationWindow;
  onSent: (m: ConsultationMessageItem) => void;
}) {
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: (text: string) =>
      api<ConsultationMessageItem>(`/consultations/${appointmentId}/messages`, { method: "POST", body: { body: text } }),
    onSuccess: (m) => {
      setBody("");
      onSent(m);
    },
  });
  const open = state === "OPEN";
  const submit = () => {
    const text = body.trim();
    if (text && open && !send.isPending) send.mutate(text);
  };

  return (
    <form
      className="flex flex-col gap-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {send.error && <Alert>{send.error.message}</Alert>}
      <div className="flex items-end gap-2">
        <label htmlFor={`compose-${appointmentId}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`compose-${appointmentId}`}
          rows={2}
          maxLength={CONSULTATION_MESSAGE_MAX}
          value={body}
          disabled={!open}
          placeholder={open ? "Write a message… (Enter to send, Shift+Enter for a new line)" : state === "UPCOMING" ? "The chat isn't open yet" : "This consultation has ended"}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:opacity-60"
        />
        <Button type="submit" disabled={!open || !body.trim() || send.isPending}>
          Send
        </Button>
      </div>
    </form>
  );
}
