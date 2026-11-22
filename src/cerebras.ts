import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_PROMPT = readFileSync(
  join(import.meta.dir, "prompts", "system.md"),
  "utf-8",
);

const DEFAULT_MODEL = "llama-3.3-70b";

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
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
  return html
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function* streamUiHtml(
  query: string,
): AsyncGenerator<string, void, unknown> {
  const client = createCerebrasClient();
  const stream = await client.chat.completions.create({
    model: getModel(),
    stream: true,
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: query },
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
