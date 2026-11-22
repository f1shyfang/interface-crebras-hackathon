export type ToolArgs = Record<string, unknown>;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("That host is not allowed");
  }
  if (
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal") ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url.hostname)
  ) {
    throw new Error("Private network hosts are not allowed");
  }
  return url;
}

/** Generic REST GET/POST for generated UIs (server-side, no browser CORS). */
export async function restRequest(args: ToolArgs = {}) {
  const method = asString(args.method, "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
    throw new Error(`Unsupported method: ${method}`);
  }

  const url = assertSafeUrl(asString(args.url));
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "User-Agent": "Interface",
  };

  if (args.headers && typeof args.headers === "object" && !Array.isArray(args.headers)) {
    for (const [key, value] of Object.entries(args.headers)) {
      if (typeof value === "string" && !/^authorization$/i.test(key)) {
        headers[key] = value;
      }
    }
  }

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD" && args.body !== undefined) {
    if (typeof args.body === "string") {
      init.body = args.body;
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      init.body = JSON.stringify(args.body);
    }
  }

  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  let data: unknown = text;
  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    contentType,
    data: typeof data === "string" ? data.slice(0, 50_000) : data,
  };
}

export const restTools = {
  "rest.request": restRequest,
} as const;
