"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { NotificationItem, NotificationList, NotificationStreamEvent } from "@mindease/shared";
import { api, refreshSession } from "./api";
import { createSseParser } from "./chat-stream";

export const notificationsKey = ["notifications"] as const;

const MAX_RETRY_MS = 30_000;

/** Pages showing data a notification is about refresh when it arrives. */
function refreshRelated(qc: QueryClient, item: NotificationItem) {
  if (item.type.startsWith("APPOINTMENT_")) {
    void qc.invalidateQueries({ queryKey: ["appointments"] });
    void qc.invalidateQueries({ queryKey: ["doctor", "schedule"] });
  }
  if (item.type.startsWith("DOCTOR_")) {
    void qc.invalidateQueries({ queryKey: ["doctor", "profile"] });
    void qc.invalidateQueries({ queryKey: ["admin", "doctors"] });
  }
}

/**
 * Keeps one Server-Sent Events connection open and reconnects with backoff.
 * The server closes streams every few minutes so auth is re-checked; a 401
 * triggers a token refresh, and a failed refresh stops the loop.
 */
function useNotificationStream() {
  const qc = useQueryClient();

  useEffect(() => {
    let stopped = false;
    let abort: AbortController | undefined;
    let retryMs = 1_000;

    const onEvent = (e: NotificationStreamEvent) => {
      if (e.event === "ready") {
        // Catch up on anything missed while disconnected.
        void qc.invalidateQueries({ queryKey: notificationsKey });
        return;
      }
      qc.setQueryData<NotificationList>(notificationsKey, (old) =>
        old
          ? { items: [e.data, ...old.items].slice(0, 30), unreadCount: old.unreadCount + 1 }
          : old,
      );
      refreshRelated(qc, e.data);
    };

    async function connectOnce(): Promise<"retry" | "stop"> {
      abort = new AbortController();
      const open = () =>
        fetch("/api/notifications/stream", {
          headers: { Accept: "text/event-stream" },
          signal: abort!.signal,
        });
      let res = await open();
      if (res.status === 401) {
        if (!(await refreshSession())) return "stop";
        res = await open();
      }
      if (res.status === 401 || res.status === 403) return "stop";
      if (!res.ok || !res.body) return "retry";

      retryMs = 1_000;
      const push = createSseParser<NotificationStreamEvent>(onEvent);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return "retry";
        push(value);
      }
    }

    void (async () => {
      while (!stopped) {
        const outcome = await connectOnce().catch(() => "retry" as const);
        if (stopped || outcome === "stop") return;
        await new Promise((r) => setTimeout(r, retryMs));
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      }
    })();

    return () => {
      stopped = true;
      abort?.abort();
    };
  }, [qc]);
}

export function useNotifications() {
  const qc = useQueryClient();
  useNotificationStream();

  const list = useQuery({
    queryKey: notificationsKey,
    queryFn: () => api<NotificationList>("/notifications"),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationsKey }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api<void>("/notifications/read-all", { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationsKey }),
  });

  return { list, markRead, markAllRead };
}
