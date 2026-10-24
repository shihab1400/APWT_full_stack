import type { Metadata } from "next";
import { Suspense } from "react";
import { BookSession } from "./book-session";

export const metadata: Metadata = { title: "Book a session" };

export default function BookPage() {
  return (
    <Suspense>
      <BookSession />
    </Suspense>
  );
}
