/**
 * Pyanchor overlay CSS, hoisted out of overlay.ts in v0.23.2.
 *
 * Single export — `OVERLAY_STYLES`. The overlay's `render()` injects
 * this verbatim inside `<style>` at the top of the shadow root.
 *
 * Extracted as a pure-string module so:
 *   - overlay.ts shrinks by ~520 LOC (was 1165, becomes ~647)
 *   - CSS-only edits no longer scroll past the runtime logic
 *   - future visual-regression / theming work has a clear seam
 *
 * No CSS-in-JS interpolation — keep this a single template literal so
 * editors syntax-highlight it as CSS via the surrounding backticks.
 */

export const OVERLAY_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .pyanchor-root {
    position: fixed;
    /* v0.15.0: logical inline-end so [dir="rtl"] (Arabic) flips the
       trigger to the bottom-LEFT corner without a separate stylesheet. */
    inset-inline-end: clamp(12px, 2vw, 24px);
    bottom: clamp(12px, 2vh, 24px);
    z-index: 2147483000;
    font-family: "IBM Plex Sans KR", system-ui, sans-serif;
    color: #edf2ff;
  }
  .trigger {
    width: 58px;
    height: 58px;
    border: 1px solid rgba(121, 144, 255, 0.28);
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at top, rgba(125, 156, 255, 0.35), transparent 48%),
      linear-gradient(180deg, rgba(14, 18, 28, 0.98), rgba(21, 30, 48, 0.98));
    color: #eef3ff;
    cursor: pointer;
    box-shadow: 0 18px 42px rgba(5, 8, 14, 0.38);
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .trigger:hover {
    transform: translateY(-1px);
    border-color: rgba(151, 170, 255, 0.42);
  }
  .trigger--busy {
    border-color: rgba(97, 210, 166, 0.38);
  }
  .panel {
    position: absolute;
    inset-inline-end: 0;
    bottom: 74px;
    width: min(420px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: min(860px, calc(100dvh - 104px));
    border-radius: 24px;
    border: 1px solid rgba(132, 151, 199, 0.18);
    background:
      linear-gradient(180deg, rgba(12, 16, 24, 0.98), rgba(16, 23, 38, 0.98));
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.46);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }
  .panel__title {
    display: grid;
    gap: 4px;
  }
  .panel__title-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.92rem;
    font-weight: 700;
  }
  .panel__context {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #8b97b5;
    font-size: 0.77rem;
    line-height: 1.5;
  }
  .panel__path {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: #dbe4ff;
    font-family: "JetBrains Mono", monospace;
  }
  .icon-button {
    border: 0;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.06);
    color: #dbe4ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .mode-switch {
    margin: 14px 18px 0;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
  }
  .mode-switch__button {
    border: 0;
    border-radius: 12px;
    padding: 10px 12px;
    background: transparent;
    color: #9aa8ca;
    font-weight: 600;
    cursor: pointer;
  }
  .mode-switch__button--active {
    background: rgba(84, 111, 255, 0.2);
    color: #eef3ff;
  }
  .mode-switch__button[disabled] {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .mode-switch__button[disabled]:hover {
    background: transparent;
  }
  .mode-switch__button--active[disabled] {
    background: rgba(84, 111, 255, 0.14);
    opacity: 0.6;
  }
  .status-line {
    margin: 12px 18px 0;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    line-height: 1.55;
    color: #d7e1fb;
  }
  .status-line--running,
  .status-line--canceling {
    border-color: rgba(94, 132, 255, 0.24);
    background: rgba(94, 132, 255, 0.08);
  }
  .status-line--failed,
  .status-line--canceled {
    border-color: rgba(255, 120, 120, 0.24);
    background: rgba(255, 120, 120, 0.08);
  }
  .status-line--done {
    border-color: rgba(70, 194, 139, 0.24);
    background: rgba(70, 194, 139, 0.08);
  }
  .status-line__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .status-line__headline {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-line__meta {
    color: #93a3c7;
    font-size: 0.74rem;
  }
  .messages {
    margin: 14px 18px 0;
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    padding: 4px 0 12px;
    display: grid;
    gap: 12px;
    align-content: start;
    align-items: start;
  }
  .messages--empty {
    display: grid;
    place-items: center;
    color: #8b97b5;
    font-size: 0.82rem;
    text-align: center;
    padding: 18px 8px 12px;
  }
  .message-row {
    display: flex;
    width: 100%;
  }
  .message-row--user {
    justify-content: flex-end;
  }
  .message-row--assistant,
  .message-row--system {
    justify-content: flex-start;
  }
  .message {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    width: fit-content;
    max-width: min(84%, 330px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  }
  .message--user {
    background: rgba(84, 111, 255, 0.14);
    border-color: rgba(84, 111, 255, 0.22);
    border-bottom-right-radius: 8px;
  }
  .message--assistant {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    border-bottom-left-radius: 8px;
  }
  .message--system {
    background: rgba(70, 194, 139, 0.08);
    border-color: rgba(70, 194, 139, 0.16);
    border-bottom-left-radius: 8px;
  }
  .message--pending {
    background: rgba(255, 255, 255, 0.05);
  }
  .message__head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: #9aa8ca;
  }
  .message__name {
    font-weight: 700;
    color: #eef3ff;
  }
  .message__time {
    margin-inline-start: auto;
  }
  .message__body {
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.65;
    word-break: break-word;
  }
  .message__body--pending {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: normal;
    line-height: 1.5;
  }
  .message__body--pending .typing {
    flex: 0 0 auto;
  }
  .message__body--pending-text {
    min-width: 0;
  }
  .message__sub {
    color: #8b97b5;
    font-size: 0.75rem;
    line-height: 1.45;
  }
  .typing {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .typing__dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.3;
    animation: typing 1.1s infinite ease-in-out;
  }
  .typing__dot:nth-child(2) { animation-delay: 0.15s; }
  .typing__dot:nth-child(3) { animation-delay: 0.3s; }
  .composer {
    margin: 14px 18px 18px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    display: grid;
    gap: 12px;
  }
  .composer__title {
    display: block;
    color: #8b97b5;
    font-size: 0.76rem;
  }
  .textarea {
    width: 100%;
    min-height: 104px;
    max-height: min(220px, 28dvh);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: rgba(5, 7, 12, 0.72);
    color: inherit;
    padding: 14px;
    resize: vertical;
    font: 0.9rem/1.65 "IBM Plex Sans KR", system-ui, sans-serif;
  }
  .textarea:disabled {
    opacity: 0.72;
    cursor: not-allowed;
  }
  .composer__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .composer__hint {
    display: grid;
    gap: 3px;
    color: #8b97b5;
    font-size: 0.76rem;
  }
  .composer__hint strong {
    color: #dbe4ff;
    font-size: 0.8rem;
  }
  .composer__hint-shortcut {
    color: #6f7c9a;
    font-size: 0.7rem;
  }
  .actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .button {
    border: 0;
    border-radius: 14px;
    padding: 11px 16px;
    cursor: pointer;
    font-weight: 700;
  }
  .button--danger {
    background: rgba(255, 120, 120, 0.16);
    color: #ffd8d8;
  }
  .button--primary {
    background: linear-gradient(135deg, #4e6dff, #7e94ff);
    color: white;
  }
  .button--ghost {
    background: rgba(180, 198, 255, 0.08);
    color: #c8d3ff;
  }
  .button--ghost:hover {
    background: rgba(180, 198, 255, 0.15);
  }
  .button:disabled {
    opacity: 0.54;
    cursor: not-allowed;
  }
  .diagnostics {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid rgba(139, 157, 195, 0.16);
    border-radius: 12px;
    background: rgba(11, 16, 28, 0.5);
  }
  .diagnostics > summary {
    cursor: pointer;
    color: #8f9bbb;
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    user-select: none;
    list-style: none;
  }
  .diagnostics > summary::-webkit-details-marker {
    display: none;
  }
  .diagnostics > summary::before {
    content: "▶";
    display: inline-block;
    margin-inline-end: 6px;
    font-size: 0.6rem;
    transform: translateY(-1px);
    transition: transform 120ms ease;
  }
  .diagnostics[open] > summary::before {
    transform: translateY(-1px) rotate(90deg);
  }
  /* v0.15.0: under [dir="rtl"] the ▶ glyph points the wrong way; flip
     it horizontally so the disclosure arrow always points "into" the
     summary. The 90deg rotation when [open] still works since it
     compounds onto the mirror. The dir attribute is set on
     .pyanchor-root by render(), so this descendant selector matches. */
  [dir="rtl"] .diagnostics > summary::before {
    transform: scaleX(-1) translateY(-1px);
  }
  [dir="rtl"] .diagnostics[open] > summary::before {
    transform: scaleX(-1) translateY(-1px) rotate(-90deg);
  }
  .diagnostics__grid {
    margin: 10px 0 0;
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 4px 12px;
    font-size: 0.74rem;
    color: #b8c2da;
  }
  .diagnostics__grid dt {
    color: #6f7c9a;
  }
  .diagnostics__grid dd {
    margin: 0;
    word-break: break-all;
    font-family: "JetBrains Mono", ui-monospace, monospace;
  }
  .toast {
    position: absolute;
    inset-inline-end: 0;
    bottom: calc(100% + 12px);
    min-width: 220px;
    max-width: 320px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 12, 18, 0.96);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .toast--success { border-color: rgba(70, 194, 139, 0.32); }
  .toast--error { border-color: rgba(255, 120, 120, 0.32); }
  .toast--info { border-color: rgba(122, 146, 255, 0.32); }
  .spark, .close {
    width: 18px;
    height: 18px;
    display: inline-block;
  }
  @media (max-height: 860px) {
    .panel {
      max-height: calc(100dvh - 92px);
    }
    .mode-switch,
    .status-line,
    .messages,
    .composer {
      margin-inline-start: 16px;
      margin-inline-end: 16px;
    }
    .composer {
      margin-bottom: 16px;
      padding: 12px;
    }
    .textarea {
      min-height: 92px;
    }
  }
  @media (max-height: 740px) {
    .panel {
      bottom: 68px;
      width: min(400px, calc(100vw - 16px));
      max-width: calc(100vw - 16px);
      max-height: calc(100dvh - 96px);
      border-radius: 20px;
    }
    .panel__header {
      padding: 14px 16px 10px;
    }
    .mode-switch,
    .status-line,
    .messages,
    .composer {
      margin-top: 10px;
      margin-inline-start: 14px;
      margin-inline-end: 14px;
    }
    .composer {
      margin-bottom: 14px;
    }
    .textarea {
      min-height: 80px;
    }
  }
  @media (max-height: 680px) {
    .panel {
      bottom: 64px;
      max-height: calc(100dvh - 88px);
    }
    .messages {
      gap: 10px;
      padding-bottom: 8px;
    }
    .message {
      max-width: min(88%, 320px);
    }
    .composer__footer {
      align-items: flex-end;
      flex-direction: column;
    }
    .actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
  @keyframes typing {
    0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-2px); }
  }
`;
