import { z } from 'zod';
import type { Hotline } from './content.js';

export const CHAT_MESSAGE_MAX = 2000;

export const sendChatMessageSchema = z.object({
  /** Omit to start a new conversation. */
  sessionId: z.uuid().optional(),
  content: z
    .string()
    .trim()
    .min(1, { error: 'Message cannot be empty' })
    .max(CHAT_MESSAGE_MAX, { error: `Keep messages under ${CHAT_MESSAGE_MAX} characters` }),
});
export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>;

export interface ChatSessionSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface ChatUsage {
  used: number;
  /** null means unlimited (paid tier). */
  limit: number | null;
  resetsAt: string;
}

/** Error code returned (HTTP 429) when a free user has used today's messages. */
export const CHAT_LIMIT_REACHED = 'CHAT_LIMIT_REACHED';

/** Server-sent events streamed by POST /api/chat/messages, in order. */
export type ChatStreamEvent =
  | { event: 'session'; data: { sessionId: string; title: string | null; userMessageId: string } }
  | { event: 'crisis'; data: { hotlines: Hotline[] } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { messageId: string; usage: ChatUsage } }
  | { event: 'error'; data: { message: string } };
