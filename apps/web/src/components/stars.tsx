"use client";

import { useId } from "react";

/** Read-only stars, e.g. ★★★★☆. */
export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={`text-amber-500 ${className}`} role="img" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-border">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/** Accessible 1–5 star picker built on radio buttons. */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const name = useId();
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">Rating</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer text-2xl leading-none">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`rounded transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
              n <= value ? "text-amber-500" : "text-border hover:text-amber-300"
            }`}
          >
            ★
          </span>
          <span className="sr-only">
            {n} star{n === 1 ? "" : "s"}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
