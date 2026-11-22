import { describe, expect, test } from "bun:test";
import { finalizeHtml, sanitizeHtmlChunk } from "./cerebras.ts";

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
  test("strips wrapping fences", () => {
    expect(finalizeHtml("```html\n<html></html>\n```")).toBe("<html></html>");
  });
});
