import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_TEMPLATE = readFileSync(
  join(import.meta.dir, "prompts", "system.md"),
  "utf-8",
);
const TOOLS_PROMPT = readFileSync(
  join(import.meta.dir, "prompts", "tools.md"),
  "utf-8",
);

const DEFAULT_MODEL = "llama-3.3-70b";

const PEARL_BRIDGE = `
<script>
(() => {
  if (window.__pearl) return;
  window.__pearl = {
    call(tool, args = {}) {
      return new Promise((resolve, reject) => {
        const id = (crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now()) + Math.random().toString(16).slice(2);
        const onMsg = (event) => {
          const data = event.data;
          if (!data || data.type !== "pearl:result" || data.id !== id) return;
          window.removeEventListener("message", onMsg);
          if (data.error) reject(new Error(data.error));
          else resolve(data.result);
        };
        window.addEventListener("message", onMsg);
        parent.postMessage({ type: "pearl:call", id, tool, args }, "*");
      });
    }
  };
})();
</script>
`.trim();

export function getSystemPrompt(): string {
  return SYSTEM_TEMPLATE.replace("{{TOOLS}}", TOOLS_PROMPT);
}

export function createCerebrasClient(): Cerebras {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CEREBRAS_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
  }
  return new Cerebras({ apiKey });
}

export function getModel(): string {
  return process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL;
}

/** Strip accidental markdown fences the model sometimes wraps around HTML. */
export function sanitizeHtmlChunk(text: string, accumulated: string): string {
  let out = text;
  if (accumulated.length === 0) {
    out = out.replace(/^\s*```(?:html)?\s*/i, "");
  }
  return out;
}

export function finalizeHtml(html: string): string {
  let out = html
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  if (!out.includes("window.__pearl") && !out.includes("__pearl")) {
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${PEARL_BRIDGE}\n</head>`);
    } else if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, `<body$1>\n${PEARL_BRIDGE}`);
    } else {
      out = `${PEARL_BRIDGE}\n${out}`;
    }
  }

  return out;
}

export function buildUserMessage(
  query: string,
  preloaded?: { tool: string; result: unknown } | null,
): string {
  if (!preloaded) return query;
  return [
    query,
    "",
    "Preloaded data (use this as the initial dataset in the UI):",
    "```json",
    JSON.stringify(
      { sourceTool: preloaded.tool, data: preloaded.result },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

export async function* streamUiHtml(
  query: string,
  preloaded?: { tool: string; result: unknown } | null,
): AsyncGenerator<string, void, unknown> {
  const client = createCerebrasClient();
  const stream = await client.chat.completions.create({
    model: getModel(),
    stream: true,
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: buildUserMessage(query, preloaded) },
    ],
  });

  let accumulated = "";
  for await (const chunk of stream) {
    if (!("object" in chunk) || chunk.object !== "chat.completion.chunk") continue;
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (!delta) continue;
    const cleaned = sanitizeHtmlChunk(delta, accumulated);
    accumulated += cleaned;
    yield cleaned;
  }
}
