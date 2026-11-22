import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { finalizeHtml, streamUiHtml } from "./cerebras.ts";
import {
  listLocalTools,
  openclawConfigured,
  prefetchGitHubContext,
  runAction,
} from "./openclaw.ts";

const app = new Hono();

app.post("/api/generate", async (c) => {
  let body: { query?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }

  if (!process.env.CEREBRAS_API_KEY) {
    return c.json(
      {
        error:
          "CEREBRAS_API_KEY is not set. Copy .env.example to .env and add your key.",
      },
      500,
    );
  }

  return streamSSE(c, async (stream) => {
    let html = "";
    try {
      const preloaded = await prefetchGitHubContext(query);
      if (preloaded && !stream.aborted) {
        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({
            message: `Prefetched ${preloaded.tool}`,
          }),
        });
      }

      for await (const chunk of streamUiHtml(query, preloaded)) {
        if (stream.aborted) break;
        html += chunk;
        await stream.writeSSE({
          event: "token",
          data: JSON.stringify({ text: chunk }),
        });
      }

      if (!stream.aborted) {
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ html: finalizeHtml(html) }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: message }),
      });
    }
  });
});

app.post("/api/action", async (c) => {
  let body: { tool?: unknown; args?: unknown; sessionKey?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const tool = typeof body.tool === "string" ? body.tool.trim() : "";
  if (!tool) return c.json({ error: "tool is required" }, 400);

  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};

  const sessionKey =
    typeof body.sessionKey === "string" ? body.sessionKey : undefined;

  try {
    const result = await runAction({ tool, args, sessionKey });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return c.json({ ok: false, error: message }, 400);
  }
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    hasApiKey: Boolean(process.env.CEREBRAS_API_KEY),
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN),
    openclaw: openclawConfigured(),
    tools: listLocalTools(),
  }),
);

app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};

console.log(`PearlEye listening on http://localhost:${port}`);
