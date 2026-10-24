import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "AI companion" };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
