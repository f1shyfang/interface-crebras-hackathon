import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import {
  finalizeHtml,
  looksLikeCompleteHtml,
  streamUiHtml,
} from "./cerebras.ts";
import {
  listLocalTools,
  openclawConfigured,
  prefetchGitHubContext,
  runAction,
} from "./openclaw.ts";

const app = new Hono();
const MAX_RECOVERY_ATTEMPTS = 1;

app.post("/api/generate", async (c) => {
  let body: {
    query?: unknown;
    refine?: unknown;
    previousHtml?: unknown;
    recoveryError?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }

  const refine =
    typeof body.refine === "string" ? body.refine.trim() : undefined;
  const previousHtml =
    typeof body.previousHtml === "string" ? body.previousHtml : undefined;
  let recoveryError =
    typeof body.recoveryError === "string"
      ? body.recoveryError.trim()
      : undefined;

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
    try {
      const preloaded =
        refine || recoveryError
          ? null
          : await prefetchGitHubContext(query);
      if (preloaded && !stream.aborted) {
        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({
            message: `Prefetched ${preloaded.tool}`,
          }),
        });
      }

      let attempt = 0;
      let html = "";

      while (attempt <= MAX_RECOVERY_ATTEMPTS && !stream.aborted) {
        html = "";
        if (attempt > 0) {
          await stream.writeSSE({
            event: "status",
            data: JSON.stringify({
              message: "Repairing broken HTML…",
            }),
          });
        }

        for await (const chunk of streamUiHtml({
          query,
          refine: attempt === 0 ? refine : undefined,
          previousHtml:
            attempt === 0
              ? previousHtml
              : finalizeHtml(html || previousHtml || ""),
          recoveryError: attempt === 0 ? recoveryError : recoveryError,
          preloaded: attempt === 0 ? preloaded : null,
        })) {
          if (stream.aborted) break;
          html += chunk;
          await stream.writeSSE({
            event: "token",
            data: JSON.stringify({ text: chunk }),
          });
        }

        if (stream.aborted) return;

        const finalHtml = finalizeHtml(html);
        if (looksLikeCompleteHtml(finalHtml) || attempt === MAX_RECOVERY_ATTEMPTS) {
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({
              html: finalHtml,
              repaired: attempt > 0,
            }),
          });
          return;
        }

        recoveryError =
          "Document is incomplete or missing <!DOCTYPE html> / </html>. Output a full self-contained HTML page.";
        attempt += 1;
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

console.log(`Interface listening on http://localhost:${port}`);
