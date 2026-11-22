import { githubTools, type ToolArgs } from "./tools/github.ts";
import { restTools } from "./tools/rest.ts";
import { storageTools } from "./tools/storage.ts";

export type ActionRequest = {
  tool: string;
  args?: ToolArgs;
  sessionKey?: string;
};

export type ActionResult = {
  ok: true;
  tool: string;
  result: unknown;
  source: "local" | "openclaw";
};

const LOCAL_TOOLS: Record<
  string,
  (args: ToolArgs) => Promise<unknown>
> = { ...githubTools, ...restTools, ...storageTools };

export function listLocalTools(): string[] {
  return Object.keys(LOCAL_TOOLS).sort();
}

export function openclawConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_URL?.trim());
}

async function invokeOpenClaw(
  tool: string,
  args: ToolArgs,
  sessionKey?: string,
): Promise<unknown> {
  const base = process.env.OPENCLAW_URL!.replace(/\/$/, "");
  const token =
    process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
    process.env.OPENCLAW_TOKEN?.trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}/tools/invoke`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tool,
      args,
      sessionKey: sessionKey || "main",
    }),
  });

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    const msg =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error
        ? String(payload.error)
        : `OpenClaw ${res.status}: ${text.slice(0, 240)}`;
    throw new Error(msg);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    (payload as { ok: unknown }).ok === true &&
    "result" in payload
  ) {
    return (payload as { result: unknown }).result;
  }

  return payload;
}

async function invokeLocal(tool: string, args: ToolArgs): Promise<unknown> {
  const handler = LOCAL_TOOLS[tool];
  if (!handler) {
    throw new Error(
      `Unknown tool "${tool}". Available: ${listLocalTools().join(", ")}`,
    );
  }
  return handler(args);
}

/** Prefer OpenClaw gateway when configured; otherwise run local tool plugins. */
export async function runAction(
  request: ActionRequest,
): Promise<ActionResult> {
  const tool = request.tool?.trim();
  if (!tool) throw new Error("tool is required");
  const args = request.args && typeof request.args === "object" ? request.args : {};

  if (openclawConfigured()) {
    try {
      const result = await invokeOpenClaw(tool, args, request.sessionKey);
      return { ok: true, tool, result, source: "openclaw" };
    } catch (err) {
      // Fall back to local plugins for Interface github.* tools if gateway lacks them
      if (LOCAL_TOOLS[tool]) {
        const result = await invokeLocal(tool, args);
        return { ok: true, tool, result, source: "local" };
      }
      throw err;
    }
  }

  const result = await invokeLocal(tool, args);
  return { ok: true, tool, result, source: "local" };
}

export function looksLikeGitHubQuery(query: string): boolean {
  return /\b(github|gh\.com|pull request|\bprs?\b|\bissues?\b|\brepos?(itory|itories)?\b)\b/i.test(
    query,
  );
}

/** Prefetch useful GitHub context for generation prompts. */
export async function prefetchGitHubContext(query: string): Promise<{
  tool: string;
  result: unknown;
} | null> {
  if (!looksLikeGitHubQuery(query)) return null;

  const wantsPRs = /\b(pr|prs|pull requests?)\b/i.test(query);
  const wantsIssues = /\bissues?\b/i.test(query);
  const wantsRepos = /\brepos?(itory|itories)?\b/i.test(query);

  try {
    if (wantsPRs) {
      return {
        tool: "github.listPRs",
        result: await invokeLocal("github.listPRs", {}),
      };
    }
    if (wantsIssues) {
      // Prefer authenticated user's issues via search isn't in tools; use PRs-style list on a hinted repo if present
      const repoMatch = query.match(
        /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/,
      );
      if (repoMatch?.[1]) {
        return {
          tool: "github.listIssues",
          result: await invokeLocal("github.listIssues", {
            repo: repoMatch[1],
          }),
        };
      }
      return {
        tool: "github.getUser",
        result: await invokeLocal("github.getUser", {}),
      };
    }
    if (wantsRepos) {
      return {
        tool: "github.listRepos",
        result: await invokeLocal("github.listRepos", {}),
      };
    }

    return {
      tool: "github.getUser",
      result: await invokeLocal("github.getUser", {}),
    };
  } catch (err) {
    console.warn(
      "[prefetch] skipped:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
