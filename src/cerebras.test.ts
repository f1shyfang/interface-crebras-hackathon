import { describe, expect, test } from "bun:test";
import {
  buildUserMessage,
  finalizeHtml,
  sanitizeHtmlChunk,
} from "./cerebras.ts";

describe("sanitizeHtmlChunk", () => {
  test("strips opening fence on first chunk", () => {
    expect(sanitizeHtmlChunk("```html\n<!DOCTYPE html>", "")).toBe(
      "<!DOCTYPE html>",
    );
  });

  test("leaves later chunks alone", () => {
    expect(sanitizeHtmlChunk("```html", "<div>")).toBe("```html");
  });
});

describe("finalizeHtml", () => {
  test("strips wrapping fences and injects pearl bridge", () => {
    const html = finalizeHtml(
      "```html\n<html><head></head><body></body></html>\n```",
    );
    expect(html).toContain("<html>");
    expect(html).toContain("window.__pearl");
    expect(html).not.toContain("```");
  });
});

describe("buildUserMessage", () => {
  test("appends preloaded JSON block", () => {
    const msg = buildUserMessage("my PRs", {
      tool: "github.listPRs",
      result: [{ number: 1 }],
    });
    expect(msg).toContain("Preloaded data");
    expect(msg).toContain("github.listPRs");
    expect(msg).toContain('"number": 1');
  });
});
