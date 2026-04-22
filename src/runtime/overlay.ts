import { closeIcon, mountOverlayHost, sparkIcon, typingDots } from "./overlay/elements";
import { createFetchJson, runtimePath as buildRuntimePath } from "./overlay/fetch-helper";
import { escapeHtml, formatTime, shorten, takeFirstLine } from "./overlay/format";
import { createSyncStateClient } from "./overlay/polling";
import {
  createEmptyServerState,
  createUIState,
  getComposerTitle,
  getPendingBubbleTitle,
  getPlaceholder,
  getStatusHeadline,
  getStatusMeta,
  getTrackedQueuePosition,
  shouldPoll,
  type AiEditMessage,
  type AiEditMode,
  type AiEditState
} from "./overlay/state";
import { LOCALE_REGISTERED_EVENT, isRtlLocale, resolveStrings } from "./overlay/strings";
import { OVERLAY_STYLES } from "./overlay/styles";
import { renderMessagesTemplate } from "./overlay/templates";

interface RuntimeConfig {
  baseUrl: string;
  token: string;
  /** Optional locale code (e.g. "ko", "en"). Falls back to English when unset. */
  locale?: string;
}

declare global {
  interface Window {
    __PyanchorConfig?: RuntimeConfig;
    __PyanchorOverlayLoaded?: boolean;
  }
}

const POLL_INTERVAL_MS = 3500;
const AUTO_SCROLL_THRESHOLD_PX = 48;

const emptyState: AiEditState = createEmptyServerState();


const config = window.__PyanchorConfig;

// Resolve the localized string table once at boot. Order of preference:
//   1. window.__PyanchorConfig.locale (host app sets it directly)
//   2. data-pyanchor-locale on the runtime <script> tag
//   3. English defaults
const overlayScriptTag = document.querySelector<HTMLScriptElement>(
  "script[data-pyanchor-overlay='1']"
);
const localeFromScript = overlayScriptTag?.dataset.pyanchorLocale?.trim();
// Round-12 #1: track the active locale request so the
// late-register listener can re-resolve only when a bundle matching
// the overlay's requested locale arrives. `s` is mutable so the
// listener can swap it in-place; render() reads `s` lazily via
// closure, so the next render picks up the new strings.
const activeLocale = (config?.locale ?? localeFromScript ?? null)?.toLowerCase() ?? null;
let s = resolveStrings(activeLocale);

if (!config || window.__PyanchorOverlayLoaded) {
  throw new Error(s.errorRuntimeNotConfigured);
}

window.__PyanchorOverlayLoaded = true;

const { host: root, shadowRoot } = mountOverlayHost();

const uiState = createUIState();

let serverState: AiEditState = { ...emptyState };

// Lazy token reader — bootstrap blanks config.token after the
// session-exchange POST resolves (since v0.5.1), so capturing it
// at module-eval time would defeat the cookie-only fallback.
const fetchJson = createFetchJson({
  baseUrl: config.baseUrl,
  getToken: () => config.token || null,
  // Getter form: rebinds late-registered locales (round-12 #1)
  // so a fetch error toast post late-load matches the panel.
  defaultErrorMessage: () => s.errorRequestFailed
});

const runtimePath = (suffix: string) => buildRuntimePath(config.baseUrl, suffix);
const currentPath = () => window.location.pathname;

const showToast = (message: string, tone: "info" | "success" | "error") => {
  uiState.toast = { message, tone };
  if (uiState.toastTimer) {
    window.clearTimeout(uiState.toastTimer);
  }
  uiState.toastTimer = window.setTimeout(() => {
    uiState.toast = null;
    render();
  }, 3200);
  render();
};

// Closures over the local mutable uiState + serverState + the
// resolved string table. The pure versions live in ./overlay/state.ts;
// these adapters keep call sites compact and let the render() body
// stay readable.
const trackedQueuePosition = () => getTrackedQueuePosition(uiState, serverState);
const shouldPollNow = () => shouldPoll(uiState, serverState);
const statusHeadline = () =>
  getStatusHeadline(
    uiState,
    serverState,
    { thinkingPreview: shorten(takeFirstLine(serverState.thinking)) },
    s
  );
const statusMeta = () =>
  getStatusMeta(uiState, serverState, formatTime(serverState.heartbeatAt), s);
const placeholder = () => getPlaceholder(uiState.mode, s);
const composerTitle = () => getComposerTitle(uiState.mode, s);
const pendingBubbleTitle = () => getPendingBubbleTitle(uiState, serverState, s);

const renderMessages = () =>
  renderMessagesTemplate({
    messages: serverState.messages,
    queuePosition: trackedQueuePosition(),
    serverStatus: serverState.status,
    heartbeatAt: serverState.heartbeatAt,
    startedAt: serverState.startedAt,
    pendingBubbleTitle: pendingBubbleTitle(),
    strings: s
  });

// Diagnostics panel (v0.9.7 — Codex round-9 feature suggestion #6).
// Collapsible disclosure widget showing the live runtime + server
// state. Uses native <details>/<summary> for built-in keyboard +
// screen-reader semantics.
//
// v0.32.9 — open state is now passed in by render() (which captures
// the previous <details>.open BEFORE the innerHTML wipe). Pre-fix
// the panel snapped shut on every status poll because the wipe
// destroyed the open attribute; the original "Persists open/closed
// state in the DOM itself" comment was wrong about that.
const renderDiagnostics = (isOpen: boolean) => {
  const authMode = config.token ? s.diagAuthBearer : s.diagAuthCookie;
  const localeDisplay = config.locale ?? "—";
  const jobIdDisplay = serverState.jobId ?? "—";
  const modeDisplay = serverState.mode ?? "—";
  const lastUpdateDisplay = formatTime(serverState.updatedAt) ?? "—";
  return `
    <details class="diagnostics" data-action="diagnostics"${isOpen ? " open" : ""}>
      <summary>${escapeHtml(s.diagnosticsTitle)}</summary>
      <dl class="diagnostics__grid">
        <dt>${escapeHtml(s.diagRuntime)}</dt>
        <dd>${escapeHtml(config.baseUrl)}</dd>
        <dt>${escapeHtml(s.diagLocale)}</dt>
        <dd>${escapeHtml(localeDisplay)}</dd>
        <dt>${escapeHtml(s.diagAuth)}</dt>
        <dd>${escapeHtml(authMode)}</dd>
        <dt>${escapeHtml(s.diagStatus)}</dt>
        <dd>${escapeHtml(serverState.status)}</dd>
        <dt>${escapeHtml(s.diagJobId)}</dt>
        <dd>${escapeHtml(jobIdDisplay)}</dd>
        <dt>${escapeHtml(s.diagMode)}</dt>
        <dd>${escapeHtml(modeDisplay)}</dd>
        <dt>${escapeHtml(s.diagQueue)}</dt>
        <dd>${serverState.queue.length}</dd>
        <dt>${escapeHtml(s.diagLastUpdate)}</dt>
        <dd>${escapeHtml(lastUpdateDisplay)}</dd>
      </dl>
    </details>
  `;
};

const bindHistory = () => {
  const dispatch = () => window.dispatchEvent(new Event("pyanchor:navigation"));
  const wrap = <T extends "pushState" | "replaceState">(method: T) => {
    const original = history[method];
    history[method] = function wrappedHistoryMethod(this: History, ...args: Parameters<History[T]>) {
      const result = original.apply(this, args);
      dispatch();
      return result;
    };
  };

  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", dispatch);
};

// Module-level focus tracking for the panel a11y fix (Codex round-9 #1).
// `wasOpenLastRender` lets isFreshOpen distinguish the first render
// where the panel appears from later renders that happen while the
// panel is still open but focus has drifted outside the shadow tree.
// Without this, the v0.9.2 `previousActive === null` check would
// re-steal focus to the textarea on any external-focus + render race.
let wasOpenLastRender = false;

const syncStateClient = createSyncStateClient({
  fetchJson,
  buildStatusUrl: () => runtimePath("/api/status"),
  getUIState: () => uiState,
  getServerState: () => serverState,
  setServerState: (next) => {
    serverState = next;
  },
  mutateUIState: (mutator) => mutator(uiState),
  render: () => render(),
  onOutcome: (outcome) => {
    if (outcome.kind === "done") {
      showToast(outcome.mode === "chat" ? s.toastAnswerReceived : s.toastEditComplete, "success");
    } else if (outcome.kind === "failed") {
      showToast(outcome.error, "error");
    } else {
      showToast(s.toastRequestCanceled, "info");
    }
  },
  defaultJobFailedMessage: () => s.errorJobFailed
});

const syncState = (withOutcomeToast = false) => syncStateClient.sync(withOutcomeToast);

const render = () => {
  const isWorking = serverState.status === "running" || serverState.status === "canceling";
  const isBusy = isWorking || uiState.isSubmitting || uiState.isCanceling;
  const canCancel = isWorking || trackedQueuePosition() > 0;
  const headline = statusHeadline();
  const meta = statusMeta();

  const previousActive = shadowRoot.activeElement as HTMLElement | null;
  // v0.32.9 — capture <details class="diagnostics"> open state BEFORE
  // the innerHTML wipe below, so the panel doesn't snap shut on every
  // status poll. Same pattern we already use for focus + scroll.
  const previousDiagnostics = shadowRoot.querySelector<HTMLDetailsElement>("details.diagnostics");
  const diagnosticsOpen = previousDiagnostics ? previousDiagnostics.open : false;
  const previousMessagesPanel = shadowRoot.querySelector<HTMLElement>(".messages");
  const previousScrollState = previousMessagesPanel
    ? {
        scrollTop: previousMessagesPanel.scrollTop,
        shouldStickToBottom:
          previousMessagesPanel.scrollHeight - previousMessagesPanel.clientHeight - previousMessagesPanel.scrollTop <=
          AUTO_SCROLL_THRESHOLD_PX
      }
    : null;

  // Save the focused element's IDENTITY (not the DOM node — that
  // gets destroyed by the innerHTML wipe below). After the wipe we
  // re-find the element with the matching identity and restore
  // focus, so keyboard nav stays inside the dialog across renders.
  // Codex round-9 #1: v0.9.2 only restored textarea focus, leaving
  // mode-button / cancel-button / etc. clicks dropping focus to BODY.
  type FocusIdentity =
    | { kind: "textarea"; selection: { start: number; end: number } | null }
    | { kind: "action"; action: string }
    | null;

  let focusIdentity: FocusIdentity = null;
  if (previousActive) {
    if (
      previousActive.classList.contains("textarea") &&
      previousActive instanceof HTMLTextAreaElement
    ) {
      focusIdentity = {
        kind: "textarea",
        selection: { start: previousActive.selectionStart, end: previousActive.selectionEnd }
      };
    } else if (previousActive.dataset.action) {
      focusIdentity = { kind: "action", action: previousActive.dataset.action };
    }
  }

  // Fresh-open / just-closed transitions drive the auto-focus + close-
  // return behavior. Track the previous render's open state separately
  // from previousActive — externally-focused-while-still-open should
  // NOT count as fresh open (Codex round-9 edge case).
  const isFreshOpen = uiState.isOpen && !wasOpenLastRender;
  const justClosed = !uiState.isOpen && wasOpenLastRender;

  // v0.9.5 secondary actions:
  //   - Retry: re-run the last submitted prompt+mode after a fail/cancel
  //   - Copy:  put the last assistant text (or the error) on the clipboard
  // v0.9.6 (Codex round-10 #3): narrowed Copy to assistant-only.
  // System messages are bookkeeping ("Queued request canceled.",
  // "Edit job exited abnormally.") — useful to display, not useful to
  // copy. The error path stays as-is and supersedes the assistant
  // lookup when status === "failed".
  const canRetry =
    !isBusy &&
    uiState.lastSubmittedPrompt !== null &&
    (serverState.status === "failed" || serverState.status === "canceled");
  const lastAssistantMessage = [...serverState.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const copyableText =
    serverState.status === "failed" && serverState.error
      ? serverState.error
      : lastAssistantMessage?.text ?? null;
  const canCopy = copyableText !== null;

  shadowRoot.innerHTML = `
    <style>${OVERLAY_STYLES}</style>
    <div class="pyanchor-root" dir="${isRtlLocale(activeLocale) ? "rtl" : "ltr"}">
      ${uiState.toast ? `<div class="toast toast--${uiState.toast.tone}">${escapeHtml(uiState.toast.message)}</div>` : ""}
      ${uiState.isOpen ? `
        <div class="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(s.panelTitle)}" aria-describedby="pyanchor-status-line">
          <div class="panel__header">
            <div class="panel__title">
              <div class="panel__title-line">${sparkIcon}<span>${escapeHtml(s.panelTitle)}</span></div>
              <div class="panel__context">
                <span>${escapeHtml(s.panelContextLabel)}</span>
                <code class="panel__path">${escapeHtml(currentPath())}</code>
              </div>
            </div>
            <button class="icon-button" type="button" data-action="close" aria-label="${escapeHtml(s.toggleClose)}">${closeIcon}</button>
          </div>

          <div class="mode-switch" role="group" aria-label="${escapeHtml(s.composerHeadlineEdit)} / ${escapeHtml(s.composerHeadlineChat)}" title="${isBusy ? escapeHtml(s.modeLockedTitle) : ""}">
            <button class="mode-switch__button ${uiState.mode === "chat" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-chat" aria-pressed="${uiState.mode === "chat"}" ${isBusy ? "disabled" : ""}>${escapeHtml(s.modeAsk)}</button>
            <button class="mode-switch__button ${uiState.mode === "edit" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-edit" aria-pressed="${uiState.mode === "edit"}" ${isBusy ? "disabled" : ""}>${escapeHtml(s.modeEdit)}</button>
          </div>

          <div id="pyanchor-status-line" aria-live="polite" aria-atomic="true">
          ${
            headline
              ? `
                <div class="status-line status-line--${serverState.status}">
                  ${isWorking ? typingDots : ""}
                  <div class="status-line__copy">
                    <div class="status-line__headline">${escapeHtml(headline)}</div>
                    ${meta ? `<div class="status-line__meta">${escapeHtml(meta)}</div>` : ""}
                  </div>
                </div>
              `
              : ""
          }
          </div>

          ${renderMessages()}

          ${renderDiagnostics(diagnosticsOpen)}

          <form class="composer" data-action="submit">
            <div>
              <label class="composer__title" for="pyanchor-prompt">${escapeHtml(composerTitle())}</label>
              <textarea id="pyanchor-prompt" class="textarea" rows="4" placeholder="${escapeHtml(placeholder())}" ${isBusy ? "disabled" : ""} aria-label="${escapeHtml(composerTitle())}"></textarea>
            </div>
            <div class="composer__footer">
              <div class="composer__hint">
                <strong>${escapeHtml(uiState.mode === "chat" ? s.composerHeadlineChat : s.composerHeadlineEdit)}</strong>
                <span>${escapeHtml(serverState.configured ? s.composerSendHint : s.composerNotConfigured)}</span>
                <span class="composer__hint-shortcut">${escapeHtml(s.kbdShortcutHint)}</span>
              </div>
              <div class="actions">
                ${canCopy ? `<button class="button button--ghost" type="button" data-action="copy" aria-label="${escapeHtml(s.copyLast)}">${escapeHtml(s.copyLast)}</button>` : ""}
                ${canRetry ? `<button class="button button--ghost" type="button" data-action="retry" aria-label="${escapeHtml(s.retryLast)}">${escapeHtml(s.retryLast)}</button>` : ""}
                ${canCancel ? `<button class="button button--danger" type="button" data-action="cancel" aria-label="${escapeHtml(s.composerCancelLabel)}" ${uiState.isCanceling ? "disabled" : ""}>${escapeHtml(s.composerCancelLabel)}</button>` : ""}
                <button class="button button--primary" type="submit" data-action="submit-button" ${!serverState.configured || isBusy || !uiState.prompt.trim() ? "disabled" : ""}>
                  ${escapeHtml(uiState.isSubmitting ? s.composerSubmitSending : uiState.mode === "chat" ? s.composerSubmitSend : s.composerSubmitRun)}
                </button>
              </div>
            </div>
          </form>
        </div>
      ` : ""}
      <button class="trigger ${isWorking ? "trigger--busy" : ""}" type="button" data-action="toggle" aria-label="${escapeHtml(uiState.isOpen ? s.toggleClose : s.toggleOpen)}" title="${escapeHtml(s.toggleTitle)}">
        ${isWorking ? typingDots : sparkIcon}
      </button>
    </div>
  `;

  const promptField = shadowRoot.querySelector<HTMLTextAreaElement>(".textarea");
  const messagesPanel = shadowRoot.querySelector<HTMLElement>(".messages");

  if (promptField) {
    promptField.value = uiState.prompt;
  }

  // Focus restoration order:
  //   1. Textarea identity → focus textarea, restore selection
  //   2. Action identity → focus the matching button (still attached)
  //   3. Action identity but element gone (e.g. cancel disappeared
  //      after job finished) → fall back to textarea
  //   4. Fresh open + no prior identity → auto-focus textarea
  //   5. Just closed → return focus to the toggle button
  //   6. Otherwise → leave focus alone (browser default)
  if (focusIdentity?.kind === "textarea" && promptField) {
    promptField.focus({ preventScroll: true });
    if (focusIdentity.selection) {
      promptField.setSelectionRange(focusIdentity.selection.start, focusIdentity.selection.end);
    }
  } else if (focusIdentity?.kind === "action") {
    const target = shadowRoot.querySelector<HTMLElement>(
      `[data-action='${focusIdentity.action}']`
    );
    if (target && !target.matches("[disabled]")) {
      target.focus({ preventScroll: true });
    } else if (uiState.isOpen && promptField) {
      // Element disappeared (e.g. cancel after job done). Don't drop
      // focus to BODY — keep it inside the dialog.
      promptField.focus({ preventScroll: true });
    }
  } else if (isFreshOpen && promptField) {
    promptField.focus({ preventScroll: true });
  } else if (justClosed) {
    // Focus return on close (Codex round-9 feature suggestion #1):
    // Move focus back to the trigger button so keyboard users
    // don't get dropped to <body>.
    const toggle = shadowRoot.querySelector<HTMLElement>("[data-action='toggle']");
    toggle?.focus({ preventScroll: true });
  }

  wasOpenLastRender = uiState.isOpen;

  if (messagesPanel) {
    if (!previousScrollState || previousScrollState.shouldStickToBottom) {
      messagesPanel.scrollTop = messagesPanel.scrollHeight;
    } else {
      const maxScrollTop = Math.max(0, messagesPanel.scrollHeight - messagesPanel.clientHeight);
      messagesPanel.scrollTop = Math.min(previousScrollState.scrollTop, maxScrollTop);
    }
  }

  shadowRoot.querySelector<HTMLElement>("[data-action='toggle']")?.addEventListener("click", () => {
    uiState.isOpen = !uiState.isOpen;
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='close']")?.addEventListener("click", () => {
    uiState.isOpen = false;
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='mode-chat']")?.addEventListener("click", () => {
    uiState.mode = "chat";
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='mode-edit']")?.addEventListener("click", () => {
    uiState.mode = "edit";
    render();
  });

  promptField?.addEventListener("input", (event) => {
    uiState.prompt = (event.target as HTMLTextAreaElement).value;
    const submit = shadowRoot.querySelector<HTMLButtonElement>(".button--primary");
    if (submit) {
      submit.disabled = !serverState.configured || isBusy || !uiState.prompt.trim();
    }
  });

  promptField?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
    }
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='cancel']")?.addEventListener("click", async () => {
    if (uiState.isCanceling) {
      return;
    }

    uiState.isCanceling = true;
    render();

    try {
      const next = await fetchJson<AiEditState>(runtimePath("/api/cancel"), {
        method: "POST",
        body: JSON.stringify({
          jobId:
            (serverState.jobId && uiState.lastSubmittedJobId === serverState.jobId ? serverState.jobId : null) ??
            uiState.lastSubmittedJobId ??
            undefined
        })
      });
      serverState = next;
      showToast(s.toastCancelSent, "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.toastCancelFailed, "error");
    } finally {
      uiState.isCanceling = false;
      render();
    }
  });

  shadowRoot.querySelector<HTMLFormElement>("[data-action='submit']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const trimmed = uiState.prompt.trim();
    if (!trimmed || uiState.isSubmitting || isWorking) {
      return;
    }

    uiState.isSubmitting = true;
    render();

    try {
      const next = await fetchJson<AiEditState>(runtimePath("/api/edit"), {
        method: "POST",
        body: JSON.stringify({
          prompt: trimmed,
          targetPath: currentPath(),
          mode: uiState.mode
        })
      });

      serverState = next;
      // v0.9.5: stash the prompt + mode so the user can Retry without
      // re-typing if the job fails or gets canceled.
      uiState.lastSubmittedPrompt = trimmed;
      uiState.lastSubmittedMode = uiState.mode;
      uiState.prompt = "";

      const lastQueued = next.queue[next.queue.length - 1];
      uiState.lastSubmittedJobId = lastQueued?.jobId ?? next.jobId ?? null;

      if (lastQueued) {
        showToast(s.statusQueuedAt(next.queue.length), "info");
      } else {
        showToast(uiState.mode === "chat" ? s.toastQuestionSent : s.toastEditStarted, "info");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.toastFailedToStart, "error");
    } finally {
      uiState.isSubmitting = false;
      render();
    }
  });

  // v0.9.5 retry: re-fill the textarea + restore the mode the last
  // request used. Doesn't auto-submit — leaves the user in control.
  // v0.9.6 (Codex round-10 #2): explicitly move focus to the textarea
  // after the render. Without this, the focus-retention logic would
  // restore focus to the Retry button (still attached, since canRetry
  // remains true on the same render) and immediate typing would not
  // edit the restored prompt.
  shadowRoot.querySelector<HTMLElement>("[data-action='retry']")?.addEventListener("click", () => {
    if (!uiState.lastSubmittedPrompt) return;
    uiState.prompt = uiState.lastSubmittedPrompt;
    if (uiState.lastSubmittedMode) uiState.mode = uiState.lastSubmittedMode;
    render();
    const newTextarea = shadowRoot.querySelector<HTMLTextAreaElement>(".textarea");
    if (newTextarea) {
      newTextarea.focus({ preventScroll: true });
      // Position cursor at end of restored prompt so the user can
      // immediately keep typing or correct from the tail.
      const len = newTextarea.value.length;
      newTextarea.setSelectionRange(len, len);
    }
  });

  // v0.9.5 copy: write the last assistant message text (or the
  // current error) to the clipboard. Falls back to a toast on
  // permission rejection.
  shadowRoot.querySelector<HTMLElement>("[data-action='copy']")?.addEventListener("click", async () => {
    if (!copyableText) return;
    try {
      await navigator.clipboard.writeText(copyableText);
      showToast(s.toastCopied, "success");
    } catch {
      showToast(s.toastCopyFailed, "error");
    }
  });
};

document.addEventListener("mousedown", (event) => {
  if (!uiState.isOpen) {
    return;
  }
  if (root.contains(event.target as Node)) {
    return;
  }
  uiState.isOpen = false;
  render();
});

// ESC closes the overlay (a11y).
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!uiState.isOpen) return;
  uiState.isOpen = false;
  render();
});

// Cmd/Ctrl + Shift + . toggles the panel from anywhere on the page
// (v0.9.5 — Codex round-9 feature suggestion #2; v0.9.6 added the
// `event.repeat` guard from Codex round-10 #1). The accelerator is
// the same across platforms so the in-product hint can stay concise.
// Doesn't fire when the user is mid-IME composition (would otherwise
// eat composition completion keys), and doesn't bounce on a held
// chord (would otherwise toggle open/closed/open by key-repeat).
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.repeat) return;
  if (event.key !== ".") return;
  if (!event.shiftKey) return;
  if (!event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  uiState.isOpen = !uiState.isOpen;
  render();
});

// Focus trap (a11y). When the panel is open and the user Tabs past the
// last focusable element (or Shift+Tabs past the first), wrap to the
// other end so focus stays inside the dialog. Listener attached once
// at module load to avoid stacking handlers across re-renders.
shadowRoot.addEventListener("keydown", (event: Event) => {
  const keyEvent = event as KeyboardEvent;
  if (keyEvent.key !== "Tab") return;
  if (!uiState.isOpen) return;

  const panel = shadowRoot.querySelector<HTMLElement>(".panel");
  if (!panel) return;

  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("aria-hidden"));
  if (focusable.length === 0) return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = shadowRoot.activeElement as HTMLElement | null;

  if (keyEvent.shiftKey && active === first) {
    keyEvent.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!keyEvent.shiftKey && active === last) {
    keyEvent.preventDefault();
    first.focus({ preventScroll: true });
  }
});

window.addEventListener("pyanchor:navigation", () => {
  render();
});

// Round-12 #1: if the overlay booted before the requested locale
// bundle loaded, re-resolve + re-render when the bundle eventually
// arrives and fires the registration event. Only match the active
// locale so other hosts registering unrelated locales don't thrash
// the UI.
if (activeLocale) {
  window.addEventListener(LOCALE_REGISTERED_EVENT, (event: Event) => {
    const registered = (event as CustomEvent<{ locale?: string }>).detail?.locale;
    if (registered && registered === activeLocale) {
      s = resolveStrings(activeLocale);
      render();
    }
  });
}

bindHistory();
render();
void syncState(false);

window.setInterval(() => {
  if (document.visibilityState === "hidden" && !shouldPollNow()) {
    return;
  }
  void syncState(true);
}, POLL_INTERVAL_MS);
