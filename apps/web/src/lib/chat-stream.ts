import type { ChatStreamEvent, SendChatMessageDto } from "@mindease/shared";
import { refreshSession, toApiError } from "./api";

/**
 * Incremental parser for Server-Sent Events. Chunks can split an event
 * anywhere, so text is buffered until a blank line ends each event.
 */
export function createSseParser(onEvent: (e: ChatStreamEvent) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent({ event, data: JSON.parse(data.join("\n")) } as ChatStreamEvent);
    }
  };
}

/**
 * Sends a chat message and calls `onEvent` for each streamed event. HTTP
 * failures before the stream starts (validation, daily limit) throw ApiError.
 */
export async function streamChat(
  body: SendChatMessageDto,
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const send = () =>
    fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });

  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok || !res.body) throw await toApiError(res);

  const push = createSseParser(onEvent);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    push(value);
  }
}
