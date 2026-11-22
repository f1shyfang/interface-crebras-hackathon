import { describe, expect, test } from "bun:test";
import server from "./server.ts";

describe("server endpoints", () => {
  test("GET /api/health returns configured tools", async () => {
    const res = await server.fetch(new Request("http://localhost:3000/api/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tools: string[] };
    expect(body.ok).toBe(true);
    expect(body.tools).toContain("github.listPRs");
    expect(body.tools).toContain("rest.request");
    expect(body.tools).toContain("storage.set");
    expect(body.tools).toContain("storage.get");
    expect(body.tools).toContain("storage.list");
  });

  test("POST /api/action executes storage tool locally", async () => {
    const setRes = await server.fetch(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "storage.set",
          args: { key: "integration:test", value: { status: "success" } },
        }),
      }),
    );
    expect(setRes.status).toBe(200);
    const setBody = (await setRes.json()) as { ok: boolean; result: { ok: boolean } };
    expect(setBody.ok).toBe(true);
    expect(setBody.result.ok).toBe(true);

    const getRes = await server.fetch(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "storage.get",
          args: { key: "integration:test" },
        }),
      }),
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      ok: boolean;
      result: { found: boolean; value: { status: string } };
    };
    expect(getBody.ok).toBe(true);
    expect(getBody.result.found).toBe(true);
    expect(getBody.result.value.status).toBe("success");
  });

  test("POST /api/action returns 400 for unknown tool", async () => {
    const res = await server.fetch(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "nonexistent.tool",
          args: {},
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Unknown tool");
  });

  test("POST /api/generate validates missing query and api key", async () => {
    const emptyQueryRes = await server.fetch(
      new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "" }),
      }),
    );
    expect(emptyQueryRes.status).toBe(400);

    const invalidJsonRes = await server.fetch(
      new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      }),
    );
    expect(invalidJsonRes.status).toBe(400);
  });
});
