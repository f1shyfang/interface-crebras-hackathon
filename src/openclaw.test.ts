import { describe, expect, test } from "bun:test";
import { looksLikeGitHubQuery } from "./openclaw.ts";

describe("looksLikeGitHubQuery", () => {
  test("matches github phrasing", () => {
    expect(looksLikeGitHubQuery("show my GitHub PRs as a kanban")).toBe(true);
    expect(looksLikeGitHubQuery("list issues for org/repo")).toBe(true);
  });

  test("ignores unrelated queries", () => {
    expect(looksLikeGitHubQuery("colour picker with hsl")).toBe(false);
    expect(looksLikeGitHubQuery("wifi settings panel")).toBe(false);
  });
});
