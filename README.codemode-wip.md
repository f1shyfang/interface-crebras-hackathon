# crebras-hackathon — MCP Code Mode × Filesystem

Convert `@modelcontextprotocol/server-filesystem` (the classic Anthropic-MCP
reference server) to **Cloudflare Code Mode** and serve it as a Cloudflare
Worker. The original exposes 14 tools that every model call has to list out;
the new Worker exposes **exactly one** tool named `code` that the model calls
with an async arrow function. Inside the sandbox, `codemode.read_file(...)`,
`codemode.write_file(...)`, etc. are the old tools, typed.

```
+-----------------------+     tools/list      +------------------------------+
|  old filesystem MCP   | ---------------------> 14 tools, 4–5 KB/token     |
|  (vendor-filesystem/) |                     +------------------------------+
+-----------------------+     (in-mem)         +------------------------------+
                                              | codeMcpServer                |
                                              |   wraps old tools as         |
                                              |   `codemode.*` typed fns     |
                                              |   single `code` tool         |
                                              +--------------^---------------+
                                                             |
            tools/call { code: "async () => codemode…" }    |
            +----------------------------------------------+
            |
            v
   DynamicWorkerExecutor  (one Worker per call, isolated, ms startup)
            |
            v
   codemode.read_text_file({ path })  ->  old server  ->  fs/promises
```

## Files

| Path                        | What                                                        |
|-----------------------------|-------------------------------------------------------------|
| `src/server.ts`             | Worker entry: routes, `/mcp` (new), `/old`, `/metrics`, UI  |
| `src/new.ts`                | Builds the Code Mode server (one `code` tool)               |
| `src/constants.ts`          | Name, version, `code` tool description                      |
| `src/metrics.ts`            | Token estimator + per-tool metrics                          |
| `vendor-filesystem/`        | The OLD server, vendored verbatim (JS, logic untouched)     |
| `wrangler.jsonc`            | Deploy config: `LOADER`, `nodejs_compat`, `compatibility_date` |
| `measure.md`                | Measured token counts (my numbers, not Cloudflare's)        |

## Deploy

Prereqs: a Cloudflare account, `wrangler` logged into it (`npx wrangler login`),
and a script to create the sandbox service on first deploy.

```bash
# install
npm install

# build is driven by wrangler's esbuild; nothing to pre-compile.
npx wrangler deploy
```

First deploy will fail with `unknown service: kimi-codemode-sandbox`. Create the
sandbox Worker once:

```bash
npm run create-sandbox-service
```

That script generates a minimal `sandbox-worker.js` next to the project root
and uploads it as a named service. The `LOADER` binding then points at it.
Re-run `npx wrangler deploy` and you get:

```
https://kimi-codemode-filesystem.<account>.workers.dev
  /              ephemeral UI (this README page)
  /mcp           the real product: 1 tool (named `code`)
  /old           the original 14-tool server (for the side-by-side demo)
  /metrics       JSON: tool counts + tokens for both, fetched live
  /new/tools     JSON: just the new server's tool list + tokens
  /new/live-test POST { code } -> calls `code` and returns the result + timing
```

### Local dev

```bash
npx wrangler dev
# open http://localhost:8787/
```

`wrangler dev` spins up a local `LOADER` automatically (you do not need to run
`npm run create-sandbox-service`).

## MCP client hookup

Any client that speaks Streamable HTTP MCP:

```jsonc
{
  "mcpServers": {
    "kimi-filesystem": {
      "type": "streamableHttp",
      "url": "https://kimi-codemode-filesystem.<account>.workers.dev/mcp"
    }
  }
}
```

Then: `tools/list` -> exactly one tool named `code`. `tools/call { name:
"code", arguments: { code: "async () => codemode.read_text_file({ path:
'/README.md' })" } }`.

## Design notes

- **One tool, no invented names.** `codeMcpServer` introspects the old
  server's `tools/list` and embeds every schema (description, zod shape,
  defaults) as generated TypeScript inside the `code` tool's description.
  Nothing is renamed or dropped.
- **Old server is vendored, not copied.** `vendor-filesystem/` is a
  byte-for-byte copy of the published `@modelcontextprotocol/server-filesystem@2025.7.29`
  with only *import path* rewrites (`diff`, `minimatch`) so the bundler can
  resolve them without a Node `node_modules` inside the Worker. Tool names,
  descriptions, schema strings, and handler bodies are unchanged.
- **`nodejs_compat` is required** because the old server uses
  `fs/promises`, `Buffer`, `process`, `stream` — none of which exist in
  plain workers.
- **Token measurement** uses a chars/4 heuristic on the MCP `tools/list`
  payload (the same payload you paste into any LLM prompt). `measure.md`
  explains methodology and lists both counts.

## Sandbox service (what the LOADER binding does)

`DynamicWorkerExecutor` needs a target Worker to install the sandboxed
JS into. That Worker is intentionally boring: it receives an inlined bundle
+ bindings from the parent and exports a `dispatch` handler. The
`npm run create-sandbox-service` script generates the
`wrangler.sandbox.json` config + entry. You never edit it by hand.