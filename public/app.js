const HISTORY_KEY = "interface.history";
const HISTORY_LIMIT = 20;

// DOM Elements
const queryForm = document.getElementById("query-form");
const queryInput = document.getElementById("query-input");
const submitBtn = document.getElementById("submit-btn");

const emptyState = document.getElementById("empty-state");
const startersContainer = document.getElementById("starters-container");
const shimmer = document.getElementById("shimmer");
const shimmerStatus = document.getElementById("shimmer-status");
const errorEl = document.getElementById("error");

const previewContainer = document.getElementById("preview-container");
const preview = document.getElementById("preview");
const streamLine = document.getElementById("stream-line");
const statusBadge = document.getElementById("status-badge");
const statusBadgeText = document.getElementById("status-badge-text");
const statsBadge = document.getElementById("stats-badge");
const repairedBadge = document.getElementById("repaired-badge");

const viewportBtns = document.querySelectorAll(".viewport-btn");
const copyBtn = document.getElementById("copy-btn");
const copyBtnText = document.getElementById("copy-btn-text");
const openTabBtn = document.getElementById("open-tab-btn");
const downloadBtn = document.getElementById("download-btn");

const repairBanner = document.getElementById("repair-banner");
const repairMessage = document.getElementById("repair-message");
const autoRepairBtn = document.getElementById("auto-repair-btn");

const refineDock = document.getElementById("refine-dock");
const refineForm = document.getElementById("refine-form");
const refineInput = document.getElementById("refine-input");
const refineBtn = document.getElementById("refine-btn");
const refineChips = document.getElementById("refine-chips");

const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");
const newBtn = document.getElementById("new-btn");

const openLibraryBtn = document.getElementById("open-library-btn");
const closeLibraryBtn = document.getElementById("close-library-btn");
const libraryModal = document.getElementById("library-modal");
const libraryFilter = document.getElementById("library-filter");
const libraryCardsContainer = document.getElementById("library-cards-container");

// Application State
let activeController = null;
let activeQuery = "";
let currentGeneratedHtml = "";
let lastRuntimeError = "";
let renderThrottleTimer = null;
let pendingProgressiveHtml = null;

// Curated Prompts
const PROMPT_LIBRARY = [
  {
    category: "Developer & GitHub",
    title: "GitHub PRs Kanban Board",
    desc: "Interactive board with Open, In Review, and Merged columns with author avatars and badges.",
    query: "Show my GitHub PRs as a kanban board with Open, In Review, and Merged columns",
  },
  {
    category: "Developer & GitHub",
    title: "GitHub Issue Tracker",
    desc: "Filterable issue triage list with labels, state toggles, and live search.",
    query: "GitHub issue explorer for a repository with filters by state and labels",
  },
  {
    category: "Developer & GitHub",
    title: "REST API Request Tester",
    desc: "Postman-style HTTP client with method selector, headers editor, and formatted JSON output.",
    query: "REST API request tester with method selector, URL input, headers editor, and response viewer",
  },
  {
    category: "Dashboards & Metrics",
    title: "SaaS Analytics Dashboard",
    desc: "KPI summary cards for MRR and churn rate with interactive mock revenue trend chart.",
    query: "SaaS analytics dashboard with KPI cards for MRR, churn, active users, and a bar chart",
  },
  {
    category: "Dashboards & Metrics",
    title: "Server Health & Logs Monitor",
    desc: "Telemetry gauges for CPU, Memory, and Disk usage with live streaming terminal logs.",
    query: "Server telemetry monitor with CPU, Memory, Disk gauges, and live request logs",
  },
  {
    category: "Utilities & Tools",
    title: "Colour Palette Tool",
    desc: "Interactive hex/rgb/hsl color picker with shade generator and one-click copy to clipboard.",
    query: "Interactive colour picker and palette generator with hex, rgb, and hsl copy buttons",
  },
  {
    category: "Utilities & Tools",
    title: "Markdown Live Scratchpad",
    desc: "Split-pane markdown editor with live HTML rendering and real-time word counter.",
    query: "Markdown scratchpad with live side-by-side rendered preview and word counter",
  },
  {
    category: "Utilities & Tools",
    title: "Regex Matcher Playground",
    desc: "Live regex tester with pattern and flags inputs and highlighted text match spans.",
    query: "Regex playground with pattern input, test string, and interactive match highlights",
  },
  {
    category: "Stateful Scratch Apps",
    title: "Persistent Kanban Task Board",
    desc: "Drag/click task board that saves all tasks and columns into window.__pearl storage.",
    query: "Persistent kanban task board that saves columns and cards using window.__pearl storage tools",
  },
  {
    category: "Stateful Scratch Apps",
    title: "Persistent Notes & Scratchpad",
    desc: "Auto-saving notes app with tags and search that reads and writes via storage.set and storage.get.",
    query: "Quick notes scratchpad with tags, search, and auto-save via window.__pearl storage.set",
  },
  {
    category: "Panels & Settings",
    title: "macOS WiFi Settings Panel",
    desc: "Faithful replica of macOS Ventura WiFi & Network settings with signal bars and known networks.",
    query: "macOS Ventura style WiFi and Network settings panel with signal bars and known networks",
  },
  {
    category: "Panels & Settings",
    title: "Security & Profile Settings",
    desc: "Clean user settings panel with 2FA toggle, session management, and password update.",
    query: "User profile and security settings panel with 2FA toggle, password change, and notification preferences",
  },
];

// History Management
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
  const next = [query, ...loadHistory().filter((q) => q !== query)].slice(0, HISTORY_LIMIT);
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
      queryInput.value = query;
      generate({ query });
    });
    li.appendChild(btn);
    historyList.appendChild(li);
  }
}

// UI State Management
function setGenerating(isGenerating) {
  submitBtn.disabled = isGenerating;
  submitBtn.textContent = isGenerating ? "Generating…" : "Generate";
  queryInput.disabled = isGenerating;
  refineBtn.disabled = isGenerating;
  refineInput.disabled = isGenerating;

  if (isGenerating) {
    statusBadge.classList.add("streaming");
    streamLine.hidden = false;
  } else {
    statusBadge.classList.remove("streaming");
    streamLine.hidden = true;
  }
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
  previewContainer.hidden = true;
  repairBanner.hidden = true;
  currentGeneratedHtml = "";
  preview.removeAttribute("srcdoc");
}

function showShimmer(msg = "Generating with Cerebras…") {
  emptyState.hidden = true;
  previewContainer.hidden = true;
  repairBanner.hidden = true;
  shimmer.hidden = false;
  shimmerStatus.textContent = msg;
}

function showPreviewContainer() {
  emptyState.hidden = true;
  shimmer.hidden = true;
  previewContainer.hidden = false;
}

/** Construct partial HTML shell for progressive rendering during token streaming */
function progressiveHtml(raw) {
  let out = raw.replace(/^\s*```(?:html)?\s*/i, "");
  if (!/<html[\s>]/i.test(out)) {
    out = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body class="p-4">${out}`;
  }
  if (!/<\/body>/i.test(out)) out += "</body>";
  if (!/<\/html>/i.test(out)) out += "</html>";
  return out;
}

function scheduleProgressiveRender(rawText) {
  pendingProgressiveHtml = rawText;
  if (renderThrottleTimer) return;

  renderThrottleTimer = setTimeout(() => {
    renderThrottleTimer = null;
    if (pendingProgressiveHtml) {
      preview.srcdoc = progressiveHtml(pendingProgressiveHtml);
    }
  }, 120);
}

// Iframe Message & Action Bridge
async function handlePearlMessage(event) {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  // Runtime error reported by generated UI inside iframe
  if (data.type === "pearl:error") {
    lastRuntimeError = data.message || "Runtime error in generated script";
    repairMessage.textContent = `UI warning: ${lastRuntimeError}`;
    repairBanner.hidden = false;
    return;
  }

  // Tool execution call from iframe
  if (data.type === "pearl:call" && data.id) {
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
}

window.addEventListener("message", handlePearlMessage);

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

// Generation Flow (Initial, Refine, and Auto-repair)
async function generate({ query, refine, recoveryError, previousHtml }) {
  const trimmedQuery = query?.trim() || activeQuery;
  if (!trimmedQuery) return;

  if (activeController) activeController.abort();
  activeController = new AbortController();

  activeQuery = trimmedQuery;
  queryInput.value = trimmedQuery;
  clearError();
  repairBanner.hidden = true;
  lastRuntimeError = "";

  const isRefining = Boolean(refine?.trim());
  const isRecovering = Boolean(recoveryError?.trim());

  if (!isRefining && !isRecovering) {
    pushHistory(trimmedQuery);
    showShimmer("Calling Cerebras Cloud API…");
  } else {
    statusBadgeText.textContent = isRecovering ? "Repairing…" : "Refining…";
  }

  setGenerating(true);
  repairedBadge.hidden = true;

  const startTime = performance.now();
  let assembled = "";
  let chars = 0;

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: trimmedQuery,
        refine: refine?.trim(),
        recoveryError: recoveryError?.trim(),
        previousHtml: previousHtml || currentGeneratedHtml,
      }),
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
          statusBadgeText.textContent = payload.message;
        } else if (evt.event === "token" && payload.text) {
          assembled += payload.text;
          chars += payload.text.length;

          const elapsedSec = (performance.now() - startTime) / 1000;
          const tokEst = Math.round(chars / 4 / Math.max(elapsedSec, 0.1));

          statusBadgeText.textContent = `Streaming (${tokEst.toLocaleString()} tok/s)`;
          statsBadge.hidden = false;
          statsBadge.textContent = `${chars.toLocaleString()} chars • ${elapsedSec.toFixed(1)}s`;

          // Once minimal document structure is ready, stream into preview
          if (chars > 300 || assembled.includes("<body")) {
            showPreviewContainer();
            scheduleProgressiveRender(assembled);
          }
        } else if (evt.event === "done") {
          finished = true;
          const finalHtml = payload.html || assembled;
          currentGeneratedHtml = finalHtml;

          if (renderThrottleTimer) {
            clearTimeout(renderThrottleTimer);
            renderThrottleTimer = null;
          }

          showPreviewContainer();
          preview.srcdoc = finalHtml;
          statusBadgeText.textContent = "Ready";

          const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
          statsBadge.hidden = false;
          statsBadge.textContent = `${chars.toLocaleString()} chars • ${totalTime}s`;

          if (payload.repaired) {
            repairedBadge.hidden = false;
          }
        } else if (evt.event === "error") {
          throw new Error(payload.error || "Generation failed");
        }
      }
    }

    if (!finished) {
      if (!assembled.trim()) throw new Error("Empty response from Cerebras");
      currentGeneratedHtml = assembled;
      showPreviewContainer();
      preview.srcdoc = assembled;
      statusBadgeText.textContent = "Ready";
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    if (!currentGeneratedHtml) showEmpty();
    showError(err instanceof Error ? err.message : "Generation failed");
  } finally {
    setGenerating(false);
    activeController = null;
  }
}

// Viewport Switcher
viewportBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const viewport = btn.dataset.viewport;
    viewportBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    preview.className = `preview viewport-${viewport}`;
  });
});

// Action Buttons: Copy, Open Tab, Download
copyBtn.addEventListener("click", async () => {
  if (!currentGeneratedHtml) return;
  try {
    await navigator.clipboard.writeText(currentGeneratedHtml);
    copyBtnText.textContent = "Copied!";
    setTimeout(() => {
      copyBtnText.textContent = "Copy HTML";
    }, 2000);
  } catch {
    copyBtnText.textContent = "Failed";
    setTimeout(() => {
      copyBtnText.textContent = "Copy HTML";
    }, 2000);
  }
});

openTabBtn.addEventListener("click", () => {
  if (!currentGeneratedHtml) return;
  const blob = new Blob([currentGeneratedHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
});

downloadBtn.addEventListener("click", () => {
  if (!currentGeneratedHtml) return;
  const slug = activeQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "ui";
  const blob = new Blob([currentGeneratedHtml], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pearleye-${slug}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

// Refinement Dock Handlers
refineForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = refineInput.value.trim();
  if (!text) return;
  refineInput.value = "";
  generate({
    query: activeQuery,
    refine: text,
    previousHtml: currentGeneratedHtml,
  });
});

refineChips.addEventListener("click", (e) => {
  const chip = e.target.closest("button[data-refine]");
  if (!chip) return;
  generate({
    query: activeQuery,
    refine: chip.dataset.refine,
    previousHtml: currentGeneratedHtml,
  });
});

// Auto-repair Button
autoRepairBtn.addEventListener("click", () => {
  if (!lastRuntimeError) return;
  generate({
    query: activeQuery,
    recoveryError: lastRuntimeError,
    previousHtml: currentGeneratedHtml,
  });
});

// Starter Prompts Click
startersContainer.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-query]");
  if (!btn) return;
  generate({ query: btn.dataset.query });
});

// Prompt Library Modal
function renderLibraryCards(filter = "") {
  const q = filter.trim().toLowerCase();
  const filtered = PROMPT_LIBRARY.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.query.toLowerCase().includes(q),
  );

  libraryCardsContainer.innerHTML = "";
  if (filtered.length === 0) {
    libraryCardsContainer.innerHTML =
      '<p class="library-item-desc" style="grid-column: 1/-1; text-align: center; padding: 2rem;">No prompts found matching your search.</p>';
    return;
  }

  for (const item of filtered) {
    const card = document.createElement("div");
    card.className = "library-item";
    card.innerHTML = `
      <span class="library-item-cat">${item.category}</span>
      <h4 class="library-item-title">${item.title}</h4>
      <p class="library-item-desc">${item.desc}</p>
    `;
    card.addEventListener("click", () => {
      closeModal();
      generate({ query: item.query });
    });
    libraryCardsContainer.appendChild(card);
  }
}

function openModal() {
  libraryFilter.value = "";
  renderLibraryCards();
  libraryModal.hidden = false;
  libraryFilter.focus();
}

function closeModal() {
  libraryModal.hidden = true;
}

openLibraryBtn.addEventListener("click", openModal);
closeLibraryBtn.addEventListener("click", closeModal);
libraryModal.addEventListener("click", (e) => {
  if (e.target === libraryModal) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !libraryModal.hidden) closeModal();
});
libraryFilter.addEventListener("input", (e) => {
  renderLibraryCards(e.target.value);
});

// New Query and History Actions
queryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  generate({ query: queryInput.value });
});

newBtn.addEventListener("click", () => {
  if (activeController) activeController.abort();
  activeQuery = "";
  queryInput.value = "";
  clearError();
  showEmpty();
  setGenerating(false);
  renderHistory();
  queryInput.focus();
});

clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

// Initial boot
renderHistory();
queryInput.focus();
