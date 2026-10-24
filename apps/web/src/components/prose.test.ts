import { describe, expect, it } from "vitest";
import { parseBlocks } from "./prose";

describe("parseBlocks", () => {
  it("splits paragraphs, headings and lists", () => {
    const blocks = parseBlocks(
      "First line\ncontinues here.\n\n## A heading\n\n- one\n- two\n\nLast paragraph.",
    );
    expect(blocks).toEqual([
      { type: "paragraph", text: "First line continues here." },
      { type: "heading", text: "A heading" },
      { type: "list", items: ["one", "two"] },
      { type: "paragraph", text: "Last paragraph." },
    ]);
  });

  it("handles Windows line endings and extra blank lines", () => {
    expect(parseBlocks("a\r\n\r\n\r\n\r\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ]);
  });

  it("treats a chunk with only some dash lines as a paragraph", () => {
    expect(parseBlocks("- item\nnot an item")).toEqual([
      { type: "paragraph", text: "- item not an item" },
    ]);
  });

  it("keeps markup-like text as plain text", () => {
    expect(parseBlocks("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});
