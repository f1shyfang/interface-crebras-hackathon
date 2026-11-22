# PearlEye

> Describe what you want to see. See it instantly.

PearlEye generates ephemeral, fully styled UIs from natural language using **Cerebras** inference, then renders them in a sandboxed iframe.

## Phase 1 (MVP)

Type a query → stream HTML from Cerebras → render in `<iframe srcdoc>`. History is kept in `localStorage`.

## Setup

```bash
bun install
cp .env.example .env
# set CEREBRAS_API_KEY in .env
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Hot-reload server |
| `bun run start` | Production-ish start |
| `bun run typecheck` | TypeScript check |

## Stack

- Bun + Hono backend
- Cerebras Cloud SDK (`llama-3.3-70b` by default)
- Vanilla HTML / CSS / JS shell
- Generated UIs: Tailwind CDN + Alpine.js

See [PLAN.md](./PLAN.md) for architecture and Phase 2–3 stretch goals.
