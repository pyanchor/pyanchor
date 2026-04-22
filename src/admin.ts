import type { AdminHealth, AiEditState } from "./shared/types";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function renderAdminHtml(health: AdminHealth, state: AiEditState) {
  const runtimeLink = `${health.runtimeBasePath}/bootstrap.js`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pyanchor Sidecar</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans KR", system-ui, sans-serif;
        color: #edf1ff;
        background:
          radial-gradient(circle at top, rgba(92, 124, 255, 0.18), transparent 34%),
          linear-gradient(180deg, #0a0f19, #111827 70%);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
        margin-bottom: 28px;
      }
      .hero h1 {
        margin: 0 0 10px;
        font-size: clamp(1.8rem, 3vw, 2.6rem);
      }
      .hero p {
        margin: 0;
        max-width: 640px;
        color: #8f9bbb;
        line-height: 1.7;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(139, 157, 195, 0.18);
        background: rgba(14, 19, 30, 0.72);
        color: #8f9bbb;
        font-size: 0.92rem;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #f3c969;
      }
      .dot--ok { background: #46c28b; }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
      }
      .panel {
        border: 1px solid rgba(139, 157, 195, 0.18);
        background: rgba(19, 26, 40, 0.88);
        border-radius: 24px;
        padding: 22px;
        backdrop-filter: blur(18px);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
      }
      .panel h2 {
        margin: 0 0 12px;
        font-size: 1rem;
      }
      .stack {
        display: grid;
        gap: 14px;
      }
      .meta {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 8px 14px;
        font-size: 0.92rem;
      }
      .meta dt { color: #8f9bbb; }
      .meta dd {
        margin: 0;
        word-break: break-all;
      }
      a {
        color: #a9bbff;
        text-decoration: none;
      }
      pre {
        margin: 0;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(4, 7, 13, 0.62);
        color: #d4dcff;
        overflow: auto;
        font: 12px/1.6 "JetBrains Mono", monospace;
      }
      @media (max-width: 920px) {
        .hero,
        .grid {
          display: grid;
          grid-template-columns: 1fr;
        }
      }
      .queue, .messages {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
        font-size: 0.83rem;
      }
      .queue li, .messages li {
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(139, 157, 195, 0.12);
        line-height: 1.5;
      }
      .queue__mode, .messages__role, .messages__status {
        display: inline-block;
        padding: 1px 7px;
        margin-right: 6px;
        border-radius: 999px;
        font-size: 0.7rem;
        background: rgba(125, 156, 255, 0.18);
        color: #cbd6ff;
      }
      .queue__path {
        background: rgba(0, 0, 0, 0.25);
        padding: 1px 5px;
        border-radius: 4px;
        margin-right: 6px;
      }
      .queue__prompt, .messages__text {
        color: #b8c2da;
      }
      .queue__empty, .messages__empty {
        color: #6f7c9a;
        font-style: italic;
        background: transparent !important;
        border-color: transparent !important;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>Pyanchor Sidecar</h1>
          <p>Pyanchor sidecar — separate from your Next.js app. View live status, heartbeat, and queue here. The runtime overlay loads on your app's origin via /_pyanchor/*.</p>
        </div>
        <div class="badge">
          <span class="dot ${health.configured ? "dot--ok" : ""}"></span>
          <span>${health.configured ? "Configured" : "Needs server wiring"}</span>
        </div>
      </section>
      <section class="grid">
        <article class="panel stack">
          <h2>Runtime</h2>
          <dl class="meta">
            <dt>Runtime base</dt>
            <dd><a href="${escapeHtml(runtimeLink)}">${escapeHtml(health.runtimeBasePath)}</a></dd>
            <dt>Alias</dt>
            <dd>${escapeHtml(health.runtimeAliasPath)}</dd>
            <dt>Healthcheck</dt>
            <dd>${escapeHtml(health.healthcheckUrl)}</dd>
            <dt>App dir</dt>
            <dd>${escapeHtml(health.appDir)}</dd>
            <dt>Workspace</dt>
            <dd>${escapeHtml(health.workspaceDir)}</dd>
            <dt>State file</dt>
            <dd>${escapeHtml(health.stateFile)}</dd>
          </dl>
        </article>
        <article class="panel stack">
          <h2>Current State</h2>
          <dl class="meta" id="state-summary">
            <dt>Status</dt>
            <dd>${escapeHtml(state.status)}</dd>
            <dt>Target</dt>
            <dd>${escapeHtml(state.targetPath || "-")}</dd>
            <dt>Step</dt>
            <dd>${escapeHtml(state.currentStep || "-")}</dd>
            <dt>Heartbeat</dt>
            <dd>${escapeHtml(state.heartbeatLabel || "-")} / ${escapeHtml(state.heartbeatAt || "-")}</dd>
            <dt>Queue</dt>
            <dd>${state.queue.length}</dd>
          </dl>
        </article>
        <article class="panel stack">
          <h2>Queue (${state.queue.length})</h2>
          <ol class="queue" id="queue-list">
            ${
              state.queue.length === 0
                ? '<li class="queue__empty">Empty.</li>'
                : state.queue
                    .map(
                      (item) =>
                        `<li><span class="queue__mode">${escapeHtml(item.mode)}</span> ` +
                        `<code class="queue__path">${escapeHtml(item.targetPath || "/")}</code> ` +
                        `<span class="queue__prompt">${escapeHtml(
                          (item.prompt || "").slice(0, 80) + ((item.prompt || "").length > 80 ? "\u2026" : "")
                        )}</span></li>`
                    )
                    .join("")
            }
          </ol>
        </article>
        <article class="panel stack">
          <h2>Recent messages</h2>
          <ol class="messages" id="messages-list">
            ${
              state.messages.length === 0
                ? '<li class="messages__empty">No messages yet.</li>'
                : state.messages
                    .slice(-5)
                    .reverse()
                    .map(
                      (msg) =>
                        `<li><span class="messages__role">${escapeHtml(msg.role)}</span> ` +
                        `<span class="messages__status">${escapeHtml(msg.status ?? "")}</span> ` +
                        `<span class="messages__text">${escapeHtml(
                          (msg.text || "").slice(0, 120) + ((msg.text || "").length > 120 ? "\u2026" : "")
                        )}</span></li>`
                    )
                    .join("")
            }
          </ol>
        </article>
        <article class="panel stack">
          <h2>Health JSON</h2>
          <pre id="health-json">${escapeHtml(JSON.stringify(health, null, 2))}</pre>
        </article>
        <article class="panel stack">
          <h2>State JSON</h2>
          <pre id="state-json">${escapeHtml(JSON.stringify(state, null, 2))}</pre>
        </article>
      </section>
    </main>
    <script>
      const healthTarget = document.getElementById("health-json");
      const stateTarget = document.getElementById("state-json");
      const summaryTarget = document.getElementById("state-summary");
      const queueTarget = document.getElementById("queue-list");
      const messagesTarget = document.getElementById("messages-list");
      const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
      const truncate = (text, max) => {
        const s = String(text ?? "");
        return s.length > max ? s.slice(0, max) + "\u2026" : s;
      };
      async function refresh() {
        const [healthResponse, stateResponse] = await Promise.all([
          fetch("/api/admin/health", { cache: "no-store" }),
          fetch("/api/admin/state", { cache: "no-store" })
        ]);
        const health = await healthResponse.json();
        const state = await stateResponse.json();
        const queue = Array.isArray(state.queue) ? state.queue : [];
        const messages = Array.isArray(state.messages) ? state.messages : [];
        healthTarget.textContent = JSON.stringify(health, null, 2);
        stateTarget.textContent = JSON.stringify(state, null, 2);
        summaryTarget.innerHTML = [
          ["Status", state.status],
          ["Target", state.targetPath || "-"],
          ["Step", state.currentStep || "-"],
          ["Heartbeat", [state.heartbeatLabel || "-", state.heartbeatAt || "-"].join(" / ")],
          ["Queue", String(queue.length)]
        ].map(([label, value]) => "<dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd>").join("");
        queueTarget.innerHTML = queue.length === 0
          ? '<li class="queue__empty">Empty.</li>'
          : queue.map((item) =>
              "<li><span class=\"queue__mode\">" + escapeHtml(item.mode) + "</span> " +
              "<code class=\"queue__path\">" + escapeHtml(item.targetPath || "/") + "</code> " +
              "<span class=\"queue__prompt\">" + escapeHtml(truncate(item.prompt, 80)) + "</span></li>"
            ).join("");
        messagesTarget.innerHTML = messages.length === 0
          ? '<li class="messages__empty">No messages yet.</li>'
          : messages.slice(-5).reverse().map((msg) =>
              "<li><span class=\"messages__role\">" + escapeHtml(msg.role) + "</span> " +
              "<span class=\"messages__status\">" + escapeHtml(msg.status) + "</span> " +
              "<span class=\"messages__text\">" + escapeHtml(truncate(msg.text, 120)) + "</span></li>"
            ).join("");
      }
      refresh().catch(() => {});
      setInterval(() => { void refresh(); }, 3000);
    </script>
  </body>
</html>`;
}
