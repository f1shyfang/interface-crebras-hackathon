## Available tools (Interface bridge)

Generated pages can call live tools via:

```js
const data = await window.__pearl.call('github.listPRs', {})
```

`window.__pearl.call(toolName, args)` returns a Promise. Always handle errors.

### Tools

| Tool | Args | Returns |
|------|------|---------|
| `github.getUser` | `{ username? }` | Authenticated user (or public profile) |
| `github.listRepos` | `{ user?, per_page? }` | Repositories sorted by updated |
| `github.listIssues` | `{ repo, state?, per_page? }` | Issues for `owner/name` (excludes PRs) |
| `github.listPRs` | `{ repo?, user?, state?, per_page? }` | PRs for a repo, or the authenticated user's PRs |
| `rest.request` | `{ url, method?, headers?, body? }` | `{ ok, status, contentType, data }` for public http(s) APIs |
| `storage.get` | `{ key }` | `{ found, key, value, updated_at }` from persistent local scratch store |
| `storage.set` | `{ key, value }` | `{ ok, key, updated_at }` saves JSON data to persistent scratch store |
| `storage.list` | `{ prefix? }` | `{ count, items: [{ key, value, updated_at }] }` list stored keys |
| `storage.delete` | `{ key }` | `{ ok, key, deleted }` delete stored item |

### Rules for tool usage in generated UI

- Prefer rendering any **preloaded context data** embedded in the page first.
- Use `window.__pearl.call` for refresh buttons, filters, or follow-up fetches.
- Do not hardcode secrets. Never invent API tokens.
- If a tool fails, show a friendly error in the UI.
- Keep tool calls inside Alpine/JS event handlers or `init()` — not at parse time unless needed for first paint after preload.
- For `rest.request`, only call public HTTPS APIs (no localhost / private IPs). Do not send Authorization headers via this tool.
