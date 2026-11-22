const HISTORY_KEY = "pearleye.history";
const HISTORY_LIMIT = 20;

const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const submitBtn = document.getElementById("submit-btn");
const preview = document.getElementById("preview");
const shimmer = document.getElementById("shimmer");
const shimmerStatus = document.getElementById("shimmer-status");
const emptyState = document.getElementById("empty-state");
const errorEl = document.getElementById("error");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");
const newBtn = document.getElementById("new-btn");
const starters = document.getElementById("starters");

let activeController = null;
let activeQuery = "";

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function pushHistory(query) {
  const next = [query, ...loadHistory().filter((q) => q !== query)].slice(
    0,
    HISTORY_LIMIT,
  );
  saveHistory(next);
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  historyList.innerHTML = "";
  clearHistoryBtn.hidden = items.length === 0;

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No queries yet";
    historyList.appendChild(empty);
    return;
  }

  for (const query of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = query;
    btn.title = query;
    if (query === activeQuery) btn.classList.add("active");
    btn.addEventListener("click", () => {
      input.value = query;
      generate(query);
    });
    li.appendChild(btn);
    historyList.appendChild(li);
  }
}

function setGenerating(isGenerating) {
  submitBtn.disabled = isGenerating;
  submitBtn.textContent = isGenerating ? "Generating…" : "Generate";
  input.disabled = isGenerating;
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function showEmpty() {
  emptyState.hidden = false;
  shimmer.hidden = true;
  preview.hidden = true;
  preview.removeAttribute("srcdoc");
}

function showShimmer() {
  emptyState.hidden = true;
  preview.hidden = true;
  shimmer.hidden = false;
  shimmerStatus.textContent = "Generating…";
}

function showPreview(html) {
  emptyState.hidden = true;
  shimmer.hidden = true;
  preview.hidden = false;
  preview.srcdoc = html;
}

async function handlePearlCall(event) {
  const data = event.data;
  if (!data || data.type !== "pearl:call" || !data.id) return;
  if (event.source !== preview.contentWindow) return;

  try {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: data.tool, args: data.args || {} }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error || `Action failed (${res.status})`);
    }
    event.source?.postMessage(
      { type: "pearl:result", id: data.id, result: payload.result },
      "*",
    );
  } catch (err) {
    event.source?.postMessage(
      {
        type: "pearl:result",
        id: data.id,
        error: err instanceof Error ? err.message : "Action failed",
      },
      "*",
    );
  }
}

window.addEventListener("message", handlePearlCall);

function parseSseChunk(buffer) {
  const events = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
}

async function generate(query) {
  const trimmed = query.trim();
  if (!trimmed) return;

  if (activeController) activeController.abort();
  activeController = new AbortController();

  activeQuery = trimmed;
  input.value = trimmed;
  clearError();
  showShimmer();
  setGenerating(true);
  pushHistory(trimmed);
  renderHistory();

  let assembled = "";
  let chars = 0;

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
      signal: activeController.signal,
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const payload = await res.json();
        if (payload?.error) message = payload.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    if (!res.body) throw new Error("No response body from server");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;

      for (const evt of parsed.events) {
        let payload = {};
        try {
          payload = evt.data ? JSON.parse(evt.data) : {};
        } catch {
          payload = { text: evt.data };
        }

        if (evt.event === "status" && payload.message) {
          shimmerStatus.textContent = payload.message;
        } else if (evt.event === "token" && payload.text) {
          assembled += payload.text;
          chars += payload.text.length;
          shimmerStatus.textContent = `Generating… ${chars.toLocaleString()} chars`;
        } else if (evt.event === "done") {
          const html = payload.html || assembled;
          showPreview(html);
          finished = true;
        } else if (evt.event === "error") {
          throw new Error(payload.error || "Generation failed");
        }
      }
    }

    if (!finished) {
      if (!assembled.trim()) throw new Error("Empty response from model");
      showPreview(assembled);
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    showEmpty();
    showError(err instanceof Error ? err.message : "Generation failed");
  } finally {
    setGenerating(false);
    activeController = null;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate(input.value);
});

newBtn.addEventListener("click", () => {
  if (activeController) activeController.abort();
  activeQuery = "";
  input.value = "";
  clearError();
  showEmpty();
  setGenerating(false);
  renderHistory();
  input.focus();
});

clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

starters.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-query]");
  if (!btn) return;
  generate(btn.dataset.query);
});

renderHistory();
input.focus();
