# PearlEye

> Describe what you want to see. See it instantly.

PearlEye generates ephemeral, fully styled UIs from natural language using **Cerebras** inference, then renders them in a sandboxed iframe. Live tools (GitHub today) run through a local harness or an optional **OpenClaw** gateway.

## Setup

```bash
bun install
cp .env.example .env
# set CEREBRAS_API_KEY (required)
# set GITHUB_TOKEN for live github.* tools / prefetch
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phase 1 — Walking skeleton

Query → SSE stream from Cerebras → iframe `srcdoc`. History in `localStorage`.

## Phase 2 — Live data

- `POST /api/action` runs tools (`github.listPRs`, `listIssues`, `listRepos`, `getUser`)
- Generated UIs call `window.__pearl.call(tool, args)` → shell `postMessage` → `/api/action`
- GitHub-flavoured queries pre-fetch data before generation
- Optional OpenClaw: set `OPENCLAW_URL` (+ token) to proxy via `POST /tools/invoke`; local plugins remain as fallback

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Hot-reload server |
| `bun run start` | Start server |
| `bun run typecheck` | TypeScript check |
| `bun test` | Unit tests |

## Stack

- Bun + Hono
- Cerebras Cloud SDK (`llama-3.3-70b` by default)
- Vanilla shell + Tailwind/Alpine generated UIs
- Local tool plugins / optional OpenClaw gateway

See [PLAN.md](./PLAN.md) for architecture and Phase 3 stretch goals.
