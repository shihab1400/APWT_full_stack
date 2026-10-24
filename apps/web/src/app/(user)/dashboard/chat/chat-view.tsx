"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CHAT_LIMIT_REACHED,
  CHAT_MESSAGE_MAX,
  type ChatMessageItem,
  type ChatSessionSummary,
  type ChatUsage,
  type Hotline,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { CrisisCard } from "@/components/crisis-card";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import { USER_NAV } from "../nav";

interface ThreadMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  pending?: boolean;
  crisis?: Hotline[];
}

const SESSIONS_KEY = ["chat", "sessions"];
const USAGE_KEY = ["chat", "usage"];

export function ChatView() {
  return <AppShell role="USER" nav={USER_NAV}>{() => <Chat />}</AppShell>;
}

function Chat() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [sessionId, setSessionId] = useState<string | undefined>(params.get("session") ?? undefined);
  // The conversation named in the URL loads as a query; local edits take over from there.
  const initialId = params.get("session");
  const initial = useQuery({
    queryKey: ["chat", "messages", initialId],
    queryFn: () => api<ChatMessageItem[]>(`/chat/sessions/${initialId}/messages`),
    enabled: !!initialId,
    retry: false,
  });
  const [localThread, setLocalThread] = useState<ThreadMessage[] | null>(null);
  const thread = useMemo(() => localThread ?? initial.data ?? [], [localThread, initial.data]);
  const setThread = useCallback(
    (next: ThreadMessage[] | ((t: ThreadMessage[]) => ThreadMessage[])) =>
      setLocalThread((t) => {
        const current = t ?? initial.data ?? [];
        return typeof next === "function" ? next(current) : next;
      }),
    [initial.data],
  );
  const [loadingThread, setLoadingThread] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [limitHit, setLimitHit] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api<ChatSessionSummary[]>("/chat/sessions"),
  });
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: () => api<ChatUsage>("/chat/usage") });

  /** Switch conversation and keep it in the URL so refresh and back work. */
  const openSession = useCallback(
    async (id: string | undefined) => {
      abortRef.current?.abort();
      setSessionId(id);
      setError(undefined);
      window.history.replaceState(null, "", id ? `/dashboard/chat?session=${id}` : "/dashboard/chat");
      if (!id) return setThread([]);
      setLoadingThread(true);
      try {
        setThread(await qc.fetchQuery({
          queryKey: ["chat", "messages", id],
          queryFn: () => api<ChatMessageItem[]>(`/chat/sessions/${id}/messages`),
        }));
      } catch {
        setError("That conversation could not be loaded.");
        setThread([]);
      } finally {
        setLoadingThread(false);
      }
    },
    [qc, setThread],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;
    setError(undefined);
    setLimitHit(false);
    setDraft("");
    setStreaming(true);

    const userTemp = `u-${Date.now()}`;
    const replyTemp = `a-${Date.now()}`;
    setThread((t) => [
      ...t,
      { id: userTemp, role: "USER", content },
      { id: replyTemp, role: "ASSISTANT", content: "", pending: true },
    ]);
    const patchReply = (fn: (m: ThreadMessage) => ThreadMessage) =>
      setThread((t) => t.map((m) => (m.id === replyTemp ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        { sessionId, content },
        (e) => {
          switch (e.event) {
            case "session":
              if (e.data.sessionId !== sessionId) {
                setSessionId(e.data.sessionId);
                window.history.replaceState(null, "", `/dashboard/chat?session=${e.data.sessionId}`);
              }
              setThread((t) => t.map((m) => (m.id === userTemp ? { ...m, id: e.data.userMessageId } : m)));
              break;
            case "crisis":
              patchReply((m) => ({ ...m, crisis: e.data.hotlines }));
              break;
            case "delta":
              patchReply((m) => ({ ...m, content: m.content + e.data.text }));
              break;
            case "done":
              patchReply((m) => ({ ...m, id: e.data.messageId, pending: false }));
              qc.setQueryData(USAGE_KEY, e.data.usage);
              break;
            case "error":
              setError(e.data.message);
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      // Nothing was sent: take the message back out of the thread and the box.
      setThread((t) => t.filter((m) => m.id !== userTemp && m.id !== replyTemp));
      setDraft(content);
      if (err instanceof ApiError && err.body.code === CHAT_LIMIT_REACHED) {
        setLimitHit(true);
        void qc.invalidateQueries({ queryKey: USAGE_KEY });
      } else {
        setError(err instanceof ApiError ? err.message : "Message could not be sent. Please try again.");
      }
    } finally {
      patchReply((m) => ({ ...m, pending: false }));
      setStreaming(false);
      void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    await api(`/chat/sessions/${id}`, { method: "DELETE" });
    if (id === sessionId) await openSession(undefined);
    void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
  }

  const remaining =
    usage.data && usage.data.limit !== null ? Math.max(0, usage.data.limit - usage.data.used) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-3">
        <Button onClick={() => openSession(undefined)} disabled={streaming}>
          New conversation
        </Button>
        <details className="rounded-xl border border-border bg-surface lg:open" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium lg:hidden">
            Conversations
          </summary>
          <nav aria-label="Conversations" className="flex max-h-[60vh] flex-col overflow-y-auto p-1">
            {sessions.data?.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">No conversations yet.</p>
            )}
            {sessions.data?.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 rounded-lg ${
                  s.id === sessionId ? "bg-primary-soft" : "hover:bg-primary-soft/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openSession(s.id)}
                  disabled={streaming}
                  aria-current={s.id === sessionId ? "true" : undefined}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                >
                  <span className="block truncate text-sm">{s.title ?? "Conversation"}</span>
                  <span className="block text-xs text-muted">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Delete ${s.title ?? "conversation"}`}
                  className="px-2 text-muted opacity-60 hover:text-danger group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </nav>
        </details>
      </aside>

      <section aria-label="Chat" className="flex min-h-[70vh] flex-col rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3">
          <h1 className="font-semibold">AI companion</h1>
          <p className="text-xs text-muted">
            A supportive listener, not a doctor. For emergencies call 999 or 01568978234.
          </p>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4" aria-live="polite">
          {loadingThread || (localThread === null && initial.isLoading) ? (
            <p className="text-sm text-muted">Loading conversation…</p>
          ) : thread.length === 0 ? (
            <EmptyState />
          ) : (
            thread.map((m) => <Bubble key={m.id} message={m} />)
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          {error && <Alert>{error}</Alert>}
          {localThread === null && initial.error && <Alert>That conversation could not be loaded.</Alert>}
          {(limitHit || remaining === 0) && usage.data && <LimitReached usage={usage.data} />}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={CHAT_MESSAGE_MAX}
              placeholder="How are you feeling today?"
              className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <Button type="submit" disabled={streaming || !draft.trim()}>
              {streaming ? "…" : "Send"}
            </Button>
          </form>
          <p className="text-xs text-muted">
            {remaining === null
              ? "Premium: unlimited messages."
              : `${remaining} of ${usage.data!.limit} free messages left today.`}{" "}
            Enter to send, Shift+Enter for a new line.
          </p>
        </div>
      </section>
    </div>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
  const mine = message.role === "USER";
  return (
    <div className={`flex flex-col gap-2 ${mine ? "items-end" : "items-start"}`}>
      {message.crisis && <CrisisCard hotlines={message.crisis} />}
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
          mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-primary-soft text-foreground"
        }`}
      >
        {message.content ? (
          clean(message.content)
        ) : message.pending ? (
          <span className="text-muted" aria-label="Companion is typing">
            •••
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The model is asked for plain text; strip stray markdown emphasis just in case. */
const clean = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");

function EmptyState() {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-2 text-center">
      <p className="font-medium">This is a safe space to talk</p>
      <p className="text-sm text-muted">
        Share what&apos;s on your mind: stress, sleep, relationships, or anything else. Your
        conversations are private to you.
      </p>
    </div>
  );
}

function LimitReached({ usage }: { usage: ChatUsage }) {
  const resets = new Date(usage.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm">
      <span>
        You&apos;ve used all {usage.limit} free messages for today. They reset at {resets}. If you
        are in crisis you can still message, or call{" "}
        <Link href="/emergency" className="font-medium underline">
          emergency help
        </Link>
        .
      </span>
      <ButtonLink href="/dashboard/billing">Upgrade to Premium</ButtonLink>
    </div>
  );
}
