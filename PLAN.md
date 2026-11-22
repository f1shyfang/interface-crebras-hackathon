# PearlEye — Ephemeral UI Generator

> *"Describe what you want to see. See it instantly."*

## Vision

PearlEye is a single-page app where the user types a natural-language query ("show my GitHub PRs as a kanban board", "show a colour-picker", "find the WiFi settings panel for macOS") and a fully functional, styled UI is generated on-the-fly and rendered in a sandboxed iframe — then thrown away when the user moves on. **Cerebras** provides the sub-second LLM inference that makes the generation feel instant; **OpenClaw** provides the agentic harness that lets the generated UI actually *do* things (call APIs, persist state, run tools).

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (SPA)                     │
│                                                     │
│  ┌────────────┐      ┌────────────────────────────┐ │
│  │ Query Bar  │─────▶│  Sandboxed <iframe>        │ │
│  │ (input)    │      │  (generated HTML/CSS/JS)   │ │
│  └────────────┘      └────────────────────────────┘ │
│        │                        ▲                   │
└────────┼────────────────────────┼───────────────────┘
         │  POST /generate        │  postMessage (data)
         ▼                        │
┌────────────────────────────────────────────────────────┐
│                  Backend (Node / Bun)                   │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────────┐ │
│  │  /generate API   │───▶│  Cerebras Inference        │ │
│  │  (Express/Hono)  │    │  (chat.completions)        │ │
│  └──────────────────┘    │  - System prompt builds    │ │
│           │               │    HTML+Tailwind+Alpine    │ │
│           │               └────────────────────────────┘ │
│           ▼                                              │
│  ┌──────────────────┐    ┌────────────────────────────┐ │
│  │  /action API     │───▶│  OpenClaw Harness          │ │
│  │  (tool bridge)   │    │  - Tool execution          │ │
│  └──────────────────┘    │  - API calls (GitHub etc.) │ │
│                           │  - Session & memory        │ │
│                           │  - Security / sandboxing   │ │
│                           └────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend shell** | Vanilla HTML + Tailwind CSS + Alpine.js | Zero build step; the shell itself is tiny |
| **Generated UI** | Self-contained HTML rendered in `srcdoc` iframe | Sandboxed; disposable; full CSS/JS freedom |
| **CSS inside generated UI** | Tailwind CDN + inline styles | Cerebras can emit utility classes reliably |
| **Interactivity in generated UI** | Alpine.js / vanilla JS | Lightweight; no bundler needed |
| **Backend runtime** | Bun (or Node 20+) with Hono | Fast cold-start, tiny footprint |
| **LLM inference** | Cerebras Cloud API (`cerebras_cloud_sdk` / OpenAI-compat) | 1000+ tok/s streaming → feels instant |
| **Agentic harness** | OpenClaw | Stateful tool execution, security policies, session memory |
| **Data fetching** | OpenClaw tool plugins (GitHub, REST, DB, etc.) | Keeps secrets server-side; model never sees tokens |

---

## Milestones

### Phase 1 — Walking Skeleton (MVP)

> **Goal:** User types a query → sees rendered UI in < 3 s.

| # | Task | Details |
|---|------|---------|
| 1.1 | **Project scaffold** | `bun init`, install `hono`, `cerebras-cloud-sdk`. Create `src/server.ts`, `public/index.html`. |
| 1.2 | **Query bar UI** | Simple `<input>` + submit button. On submit → `POST /api/generate` with `{ query }`. |
| 1.3 | **`/api/generate` endpoint** | Receives query, calls Cerebras `chat.completions.create` with a system prompt that returns a single self-contained HTML document (Tailwind CDN, Alpine.js CDN, inline `<script>`). Streams the response with SSE. |
| 1.4 | **System prompt v1** | Instruct model: *"You are a UI generator. Given the user's request, produce a single HTML page using Tailwind CSS and Alpine.js that fulfils the request. Output ONLY the HTML — no markdown fences, no explanation. Use realistic mock data. The page must be fully self-contained."* |
| 1.5 | **Iframe renderer** | On receiving the streamed HTML, set `iframe.srcdoc = html`. Show a skeleton / shimmer while streaming. |
| 1.6 | **History sidebar** | Save last N queries to `localStorage`. Click to re-generate. |

### Phase 2 — Live Data via OpenClaw

> **Goal:** Generated UIs can fetch real data (e.g. actual GitHub issues).

| # | Task | Details |
|---|------|---------|
| 2.1 | **OpenClaw integration** | Stand up an OpenClaw agent instance. Configure channel adapter to accept HTTP calls from our backend. |
| 2.2 | **Tool bridge `/api/action`** | Backend endpoint that proxies requests from the iframe → OpenClaw → real APIs. The iframe calls `parent.postMessage({ tool: 'github.listIssues', args: { repo: '...' } })`. The shell forwards to `/api/action`. |
| 2.3 | **GitHub tool plugin** | Register a GitHub tool in OpenClaw (uses a PAT or OAuth app). Exposes `listRepos`, `listIssues`, `listPRs`, `getUser`. |
| 2.4 | **Updated system prompt** | Tell the model about available tools. It should emit JS that calls `window.__pearl.call('github.listIssues', { repo })` which the shell maps to `/api/action`. |
| 2.5 | **Data injection** | When a query mentions "my GitHub …", the backend pre-fetches relevant data via OpenClaw *before* generating the UI, and passes it into the prompt as context so the initial render already has real data. |

### Phase 3 — Polish & Power-ups

| # | Task | Details |
|---|------|---------|
| 3.1 | **Regenerate / tweak** | Add a "Refine" input below the iframe: *"Make it darker"*, *"Add a search filter"*. Sends original + refinement to Cerebras. |
| 3.2 | **Export** | "Download HTML" button. Also "Open in new tab". |
| 3.3 | **Responsive preview** | Toggle between desktop / tablet / mobile iframe widths. |
| 3.4 | **Prompt library** | Curated starter prompts: "Kanban board", "Data table", "Dashboard", "Settings panel", "Pricing page". |
| 3.5 | **Multi-tool support** | Add more OpenClaw tool plugins: REST (arbitrary API calls), SQLite (local scratch DB), filesystem (read local files), calendar, etc. |
| 3.6 | **Streaming render** | Instead of waiting for the full HTML, inject partial HTML into the iframe as tokens stream in (progressive rendering). |
| 3.7 | **Error recovery** | If the generated HTML is broken, auto-retry with the error message fed back to Cerebras. |

---

## Key Design Decisions

### 1. Why an iframe with `srcdoc`?
- **Security**: The generated code runs in a sandboxed origin. It cannot access the parent's cookies, localStorage, or DOM.
- **Isolation**: Each generation is a clean slate. No CSS/JS leaks between generations.
- **Simplicity**: No bundler, no virtual DOM diffing — just set `srcdoc` and go.

### 2. Why Cerebras over other LLM providers?
- **Speed**: At 1000–3000 tok/s, a full HTML page (~2–4k tokens) generates in 1–3 seconds. This makes the experience feel like *opening* a page, not *waiting* for one.
- **OpenAI-compatible API**: Drop-in replacement; easy to swap models or add fallback providers.

### 3. Why OpenClaw for the backend agent layer?
- **Tool execution**: OpenClaw's ReAct loop and typed tool plugins mean the generated UI can trigger real actions (fetch GitHub data, query a DB) without us building a bespoke tool-calling framework.
- **Security policies**: OpenClaw gates tool execution with approval policies — important when LLM-generated code is requesting real API calls.
- **Session memory**: OpenClaw persists context across refinements, so "make it darker" remembers the original query.

### 4. Communication: Iframe ↔ Shell ↔ Backend
```
Iframe JS                    Shell (parent)              Backend
   │                              │                         │
   │ postMessage({tool, args})    │                         │
   │─────────────────────────────▶│                         │
   │                              │  POST /api/action       │
   │                              │────────────────────────▶│
   │                              │                         │──▶ OpenClaw
   │                              │   { result }            │◀──
   │                              │◀────────────────────────│
   │  postMessage({result})       │                         │
   │◀─────────────────────────────│                         │
```

---

## File Structure (Target)

```
pearleye/
├── PLAN.md                  ← you are here
├── package.json
├── tsconfig.json
├── .env.example             ← CEREBRAS_API_KEY, GITHUB_TOKEN, OPENCLAW_*
├── src/
│   ├── server.ts            ← Hono app: /api/generate, /api/action
│   ├── cerebras.ts          ← Cerebras client wrapper + system prompts
│   ├── openclaw.ts          ← OpenClaw agent setup + tool registry
│   ├── prompts/
│   │   ├── system.md        ← Main system prompt for UI generation
│   │   └── tools.md         ← Tool descriptions injected into prompt
│   └── tools/
│       ├── github.ts        ← GitHub tool plugin for OpenClaw
│       └── rest.ts          ← Generic REST tool plugin
├── public/
│   ├── index.html           ← Shell SPA (query bar + iframe + sidebar)
│   ├── style.css            ← Minimal shell styling
│   └── app.js               ← Shell logic (submit, render, postMessage bridge)
└── README.md
```

---

## Example User Flows

### Flow 1: "Show my GitHub PRs as a kanban board"
1. User types query → hits Enter.
2. Backend calls OpenClaw `github.listPRs({ user: 'me' })` to fetch real PR data.
3. Backend sends query + PR data to Cerebras: *"Generate a kanban board UI showing these PRs: [data]"*.
4. Cerebras streams back a full HTML page with columns (Open / In Review / Merged), PR cards with titles, authors, labels.
5. Shell sets `iframe.srcdoc` → user sees their real PRs in a kanban layout.

### Flow 2: "Colour picker with hex/rgb/hsl"
1. User types query → hits Enter.
2. No data fetch needed — purely generative.
3. Cerebras generates an interactive colour picker with sliders, preview swatch, and format toggles.
4. Rendered in iframe. Fully interactive — no server round-trips needed.

### Flow 3: "What does the macOS WiFi settings panel look like?"
1. User types query → hits Enter.
2. Cerebras generates a faithful replica of the macOS WiFi settings panel using Tailwind styling.
3. Rendered in iframe. Static but visually accurate mock.

---

## Decisions Made

- **Auth**: None. No login, no OAuth. GitHub PAT is set via `.env` for local use only.
- **Deployment**: Local-only. Runs on `localhost`.
- **OpenClaw**: Runs locally as a co-process alongside the backend server.
- **Model choice**: TBD — test Cerebras models for HTML generation quality.

---

## Getting Started (after plan approval)

```bash
# 1. Init project
cd pearleye && bun init

# 2. Install deps
bun add hono cerebras-cloud-sdk

# 3. Set env
cp .env.example .env
# → fill in CEREBRAS_API_KEY

# 4. Run
bun run src/server.ts
# → open http://localhost:3000
```

---

> [!IMPORTANT]
> This plan prioritises **Phase 1 (walking skeleton)** for the hackathon. Phases 2–3 are stretch goals. A working demo that generates beautiful UIs from natural language in < 3 seconds is the core deliverable.
