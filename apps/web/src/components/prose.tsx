import type { ReactNode } from "react";

export type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/** Parses the lightweight markdown used for articles: paragraphs, "## " headings, "- " lists. */
export function parseBlocks(source: string): Block[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      if (chunk.startsWith("## ")) return { type: "heading", text: chunk.slice(3).trim() };
      const lines = chunk.split("\n");
      if (lines.every((l) => l.trimStart().startsWith("- "))) {
        return { type: "list", items: lines.map((l) => l.trimStart().slice(2).trim()) };
      }
      return { type: "paragraph", text: lines.join(" ") };
    });
}

/** Renders article text as plain React elements. Nothing is injected as HTML. */
export function Prose({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-4 leading-7">
      {parseBlocks(source).map((block, i): ReactNode => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={i} className="mt-4 text-xl font-semibold">
                {block.text}
              </h2>
            );
          case "list":
            return (
              <ul key={i} className="ml-5 list-disc space-y-1">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          default:
            return <p key={i}>{block.text}</p>;
        }
      })}
    </div>
  );
}
