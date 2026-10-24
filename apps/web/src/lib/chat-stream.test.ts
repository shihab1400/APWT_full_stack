import { describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "@mindease/shared";
import { createSseParser } from "./chat-stream";

function collect() {
  const events: ChatStreamEvent[] = [];
  return { events, push: createSseParser((e) => events.push(e)) };
}

describe("createSseParser", () => {
  it("parses complete events", () => {
    const { events, push } = collect();
    push('event: delta\ndata: {"text":"Hi"}\n\nevent: delta\ndata: {"text":" there"}\n\n');
    expect(events).toEqual([
      { event: "delta", data: { text: "Hi" } },
      { event: "delta", data: { text: " there" } },
    ]);
  });

  it("buffers events split across chunks", () => {
    const { events, push } = collect();
    push("event: del");
    push('ta\ndata: {"te');
    expect(events).toEqual([]);
    push('xt":"ok"}\n');
    push("\n");
    expect(events).toEqual([{ event: "delta", data: { text: "ok" } }]);
  });

  it("handles CRLF line endings", () => {
    const { events, push } = collect();
    push('event: done\r\ndata: {"messageId":"m1"}\r\n\r\n');
    expect(events).toEqual([{ event: "done", data: { messageId: "m1" } }]);
  });

  it("keeps text that looks like event syntax inside JSON intact", () => {
    const { events, push } = collect();
    push(`event: delta\ndata: ${JSON.stringify({ text: "line one\n\nevent: fake" })}\n\n`);
    expect(events).toEqual([{ event: "delta", data: { text: "line one\n\nevent: fake" } }]);
  });
});
