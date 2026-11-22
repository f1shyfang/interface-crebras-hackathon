import { describe, expect, test } from "bun:test";
import {
  buildUserMessage,
  finalizeHtml,
  looksLikeCompleteHtml,
  progressiveHtml,
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
  test("strips wrapping fences and injects pearl bridge with error handlers", () => {
    const html = finalizeHtml(
      "```html\n<html><head></head><body></body></html>\n```",
    );
    expect(html).toContain("<html>");
    expect(html).toContain("window.__pearl");
    expect(html).toContain("pearl:error");
    expect(html).not.toContain("```");
  });
});

describe("looksLikeCompleteHtml", () => {
  test("returns true for complete html document", () => {
    expect(
      looksLikeCompleteHtml("<!DOCTYPE html><html><head></head><body>Hi</body></html>"),
    ).toBe(true);
  });

  test("returns false for partial or incomplete html", () => {
    expect(looksLikeCompleteHtml("<div>Hello world</div>")).toBe(false);
    expect(looksLikeCompleteHtml("<!DOCTYPE html><html><body>")).toBe(false);
  });
});

describe("progressiveHtml", () => {
  test("wraps partial HTML in document tags", () => {
    const partial = '<div class="card">Loading...</div>';
    const rendered = progressiveHtml(partial);
    expect(rendered).toContain("<!DOCTYPE html>");
    expect(rendered).toContain("<html>");
    expect(rendered).toContain("tailwindcss");
    expect(rendered).toContain(partial);
    expect(rendered).toContain("</body>");
    expect(rendered).toContain("</html>");
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

  test("includes refine and previousHtml context", () => {
    const msg = buildUserMessage("my PRs", null, {
      refine: "Make it dark mode",
      previousHtml: "<html><body>Previous</body></html>",
    });
    expect(msg).toContain("my PRs");
    expect(msg).toContain("Refinement request");
    expect(msg).toContain("Make it dark mode");
    expect(msg).toContain("Previous HTML to refine/fix");
    expect(msg).toContain("Previous");
  });

  test("includes recoveryError instructions", () => {
    const msg = buildUserMessage("my PRs", null, {
      recoveryError: "Uncaught ReferenceError: x is not defined at line 12",
      previousHtml: "<html><script>x.test()</script></html>",
    });
    expect(msg).toContain("The previous HTML was broken. Fix these problems");
    expect(msg).toContain("ReferenceError");
  });
});
