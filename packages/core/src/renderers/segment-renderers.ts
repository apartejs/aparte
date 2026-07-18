/**
 * Aparte Segment Renderers
 * Built-in renderers for core segment types
 */

import type {
    AparteSegmentBase,
    AparteSegmentRenderer,
    AparteTextSegment,
    AparteThinkingSegment,
    AparteCodeSegment,
    AparteTerminalSegment,
    AparteErrorSegment,
    AparteProgressSegment,
    AparteFileTreeSegment,
    AparteFileNode,
    AparteArtifactSegment,
} from '../types/index.js';
// Renderers are plain functions: they read the ambient config set by the
// invoking component (runWithConfig), falling back to an element when one is
// in scope for late executions (event handlers, window-event callbacks) —
// see config-context.ts. `contextConfig()` with no element = ambient or global.
import { contextConfig } from '../config/index.js';
import type { AparteStreamingMarkdownRenderer } from '../config/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
    let out = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '&') out += '&amp;';
        else if (ch === '<') out += '&lt;';
        else if (ch === '>') out += '&gt;';
        else if (ch === '"') out += '&quot;';
        else if (ch === "'") out += '&#039;';
        else out += ch;
    }
    return out;
}

/**
 * Strip leading/trailing markdown code fences (``` or ~~~, optional lang tag).
 * Also strips any content that appears after the closing fence (small models
 * frequently duplicate lines after the closing ``` block).
 *
 * Char-based scanner — no regex.
 */
function stripCodeFences(content: string): string {
    let s = content;

    // Opening fence: leading ``` or ~~~ (3+) optionally followed by language tag,
    // then a newline. Walk the start of the string only.
    if (s.startsWith('```') || s.startsWith('~~~')) {
        const fenceChar = s[0];
        let i = 0;
        while (i < s.length && s[i] === fenceChar) i++;
        // Skip language tag chars (anything until newline)
        while (i < s.length && s[i] !== '\n') i++;
        // Skip the newline itself if present
        if (i < s.length && s[i] === '\n') i++;
        s = s.slice(i);
    }

    // Closing fence: scan forward to find a line that is exclusively `````/`~~~`+
    // optionally followed by trailing whitespace; cut there + everything after.
    const closeAt = findClosingFence(s);
    if (closeAt !== -1) s = s.slice(0, closeAt);

    return s.trim();
}

/** Find the byte offset where a closing fence line begins, or -1 if none. */
function findClosingFence(s: string): number {
    let i = 0;
    while (i < s.length) {
        // Find start of next line
        const lineStart = i;
        // Skip leading whitespace on this line (indentation)
        let k = lineStart;
        while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++;
        if (k < s.length && (s[k] === '`' || s[k] === '~')) {
            const fenceChar = s[k];
            let runs = 0;
            while (k < s.length && s[k] === fenceChar) { runs++; k++; }
            if (runs >= 3) {
                // The rest of the line should be whitespace only — otherwise
                // it's not a closing fence (e.g. inline backtick text).
                let onlyWs = true;
                while (k < s.length && s[k] !== '\n') {
                    if (s[k] !== ' ' && s[k] !== '\t' && s[k] !== '\r') { onlyWs = false; break; }
                    k++;
                }
                if (onlyWs) {
                    // Cut at start of this line; if a `\n` precedes, drop it too
                    let cut = lineStart;
                    if (cut > 0 && s[cut - 1] === '\n') cut--;
                    return cut;
                }
            }
        }
        // Advance to next line
        while (i < s.length && s[i] !== '\n') i++;
        if (i < s.length) i++;
    }
    return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer Registry
// ─────────────────────────────────────────────────────────────────────────────

const renderers = new Map<string, AparteSegmentRenderer>();
let styleElement: HTMLStyleElement | null = null;

/**
 * Register a segment renderer
 */
export function registerSegmentRenderer<T extends AparteSegmentBase>(
    renderer: AparteSegmentRenderer<T>
): void {
    renderers.set(renderer.type, renderer as AparteSegmentRenderer);
    injectRendererStyles();
}

/**
 * Unregister a segment renderer
 */
export function unregisterSegmentRenderer(type: string): void {
    renderers.delete(type);
}

/**
 * Get renderer for a segment type
 */
export function getSegmentRenderer(type: string): AparteSegmentRenderer | undefined {
    return renderers.get(type);
}

/**
 * Get all registered renderers
 */
export function getAllRenderers(): readonly AparteSegmentRenderer[] {
    return Array.from(renderers.values());
}

/**
 * Collect all renderer styles
 */
export function collectRendererStyles(): string {
    return Array.from(renderers.values())
        .map(r => r.getStyles?.() || '')
        .filter(Boolean)
        .join('\n');
}

/**
 * Inject renderer styles into the document head
 */
export function injectRendererStyles(): void {
    if (typeof document === 'undefined') return;

    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'aparte-renderer-styles';
        document.head.appendChild(styleElement);
    }

    styleElement.textContent = collectRendererStyles();
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Text segment renderer.
 *
 * During streaming, if an incremental Markdown provider is registered
 * (`@aparte/provider-streaming-markdown`), each new chunk is fed to a persistent
 * incremental parser that *appends* DOM nodes — O(n) over the whole message,
 * with no per-token re-parse or `innerHTML` rebuild (that per-token render +
 * GPU paint storm is what starves the model's WebGPU decode). It also renders
 * partial Markdown live — `**bold` shows bold before the closing `**` arrives.
 *
 * A NON-streaming update (`isStreaming === false`) flushes the parser with
 * `end()` — which emits its buffered token-lookahead tail, e.g. a trailing
 * emoji — and re-renders once with the one-shot `renderMarkdown` for full
 * fidelity. `populateBubbleFromMessage` stamps `isStreaming: false` on the
 * segments of a settled message so a load / re-sync takes this safe path.
 */
type TextStreamHost = HTMLElement & {
    /**
     * Incremental-render state for this segment element:
     *   `undefined` → not started · `null` → no provider (one-shot fallback)
     *   object      → active incremental renderer + chars already written.
     */
    _aparteSmd?: { renderer: AparteStreamingMarkdownRenderer; written: number } | null;
};

const textRenderer: AparteSegmentRenderer<AparteTextSegment> = {
    type: 'text',
    render: (segment) => `<div class="segment segment-text" data-segment-id="${escapeHtml(segment.id)}"><div class="segment-content">${contextConfig().renderMarkdown(segment.content)}</div></div>`,
    update: (el, segment) => {
        const contentEl = el.querySelector('.segment-content');
        if (!contentEl) return;
        const host = el as TextStreamHost;
        const streaming = segment.isStreaming !== false;

        if (streaming) {
            // Lazily create an incremental renderer on the first streaming update.
            if (host._aparteSmd === undefined) {
                const renderer = contextConfig().createStreamingMarkdownRenderer(contentEl as HTMLElement);
                if (renderer) {
                    contentEl.textContent = '';   // drop the skeleton — smd appends from scratch
                    host._aparteSmd = { renderer, written: 0 };
                } else {
                    host._aparteSmd = null;         // no provider → one-shot fallback below
                }
            }
            const smd = host._aparteSmd;
            if (smd) {
                const delta = segment.content.slice(smd.written);
                if (delta) {
                    smd.renderer.write(delta);
                    smd.written = segment.content.length;
                }
                return;
            }
            // smd === null → fall through to the one-shot render.
        } else if (host._aparteSmd) {
            // Stream finished — flush the incremental parser (emits its buffered
            // trailing characters), then re-render once below with the one-shot
            // provider for full Markdown fidelity.
            host._aparteSmd.renderer.end();
            host._aparteSmd = undefined;
        }

        contentEl.innerHTML = contextConfig().renderMarkdown(segment.content);
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Thinking Renderer
// ─────────────────────────────────────────────────────────────────────────────

const thinkingRenderer: AparteSegmentRenderer<AparteThinkingSegment> = {
    type: 'thinking',
    render: (segment) => `<details class="segment segment-thinking" data-segment-id="${escapeHtml(segment.id)}" ${segment.collapsed ? '' : 'open'}><summary class="thinking-header"><span class="thinking-label">${segment.label || contextConfig().t('thinking')}</span><span class="thinking-toggle"></span></summary><div class="thinking-content">${escapeHtml(segment.content)}</div></details>`,
    update: (el, segment) => {
        // collapsed state is managed by _applySegmentUpdate based on explicit updates only —
        // never override what the user set by clicking <summary>
        const contentEl = el.querySelector('.thinking-content');
        if (contentEl) contentEl.textContent = segment.content;
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Code Renderer
// ─────────────────────────────────────────────────────────────────────────────

const codeRenderer: AparteSegmentRenderer<AparteCodeSegment> = {
    type: 'code',
    render: (segment) => `
        <div class="segment segment-code" data-segment-id="${escapeHtml(segment.id)}">
            <div class="code-header">
                ${segment.filename
                    ? `<span class="code-filename">${escapeHtml(segment.filename)}</span>`
                    : `<span class="code-header-filler"></span>`}
                <span class="code-language">${escapeHtml(segment.language || '')}</span>
                <button class="code-copy" data-action="copy" title="${contextConfig().t('copy')}">
                    ${contextConfig().getIcon('copy')}
                </button>
            </div>
            <div class="code-content-wrapper">
                <pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>
            </div>
        </div>
    `,
    setup: (element, segment) => {
        // Async highlight: replace plain <pre><code> with highlighted HTML once ready
        const wrapper = element.querySelector('.code-content-wrapper');
        if (wrapper) {
            contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                wrapper.innerHTML = html;
            });
        }

        const copyBtn = element.querySelector('.code-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — the ambient render config is
                // gone; resolve from the connected element instead.
                navigator.clipboard.writeText(segment.content || '');
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }
    },
    update: (element, segment) => {
        if (segment.isStreaming) {
            // During streaming: update raw text only to avoid firing highlight on every token.
            // The code-content-wrapper may contain either the plain <pre><code> (initial render)
            // or highlighted HTML (from a previous async highlight). Update the innermost
            // <code> element if present; otherwise fall back to the wrapper itself.
            const codeEl = element.querySelector('.code-content-wrapper code');
            if (codeEl) {
                codeEl.textContent = segment.content;
            } else {
                const wrapper = element.querySelector('.code-content-wrapper');
                if (wrapper) wrapper.innerHTML = `<pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>`;
            }
        } else {
            // Streaming complete — run the highlight provider for polished output.
            const wrapper = element.querySelector('.code-content-wrapper');
            if (wrapper) {
                contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                    wrapper.innerHTML = html;
                });
            }
        }
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Renderer
// ─────────────────────────────────────────────────────────────────────────────

const terminalRenderer: AparteSegmentRenderer<AparteTerminalSegment> = {
    type: 'terminal',
    render: (segment) => `
        <div class="segment segment-terminal" data-segment-id="${escapeHtml(segment.id)}">
            <div class="terminal-command-block">
                <div class="terminal-icon">
                    ${contextConfig().getIcon('terminal')}
                </div>
                <code class="terminal-command">${escapeHtml(segment.command || '')}</code>
                <div class="terminal-actions">
                    ${segment.isRunning
            ? `<span class="terminal-running"><span class="spinner"></span>${contextConfig().t('running')}</span>`
            : `<button class="terminal-run-btn" data-action="run" aria-label="${contextConfig().t('run')}" title="${contextConfig().t('run')}">${contextConfig().t('run')}</button>`}
                    <button class="terminal-copy-btn" data-action="copy" aria-label="${contextConfig().t('copy')}" title="${contextConfig().t('copy')}">
                        ${contextConfig().getIcon('copy')}
                    </button>
                </div>
            </div>
            ${segment.output ? `<div class="terminal-output">${escapeHtml(segment.output)}</div>` : ''}
            ${segment.exitCode !== undefined && segment.exitCode !== 0
            ? `<div class="terminal-error">Command failed with exit code ${segment.exitCode}</div>`
            : ''}
        </div>
    `,
    setup: (element) => {
        const copyBtn = element.querySelector('.terminal-copy-btn');
        const command = element.querySelector('.terminal-command');
        if (copyBtn && command) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — resolve from the element.
                navigator.clipboard.writeText(command.textContent || '');
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }

        // Run button dispatches a custom event
        const runBtn = element.querySelector('.terminal-run-btn');
        if (runBtn) {
            runBtn.addEventListener('click', () => {
                const segmentId = element.getAttribute('data-segment-id');
                element.dispatchEvent(new CustomEvent('aparte-terminal-run', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        segmentId,
                        command: command?.textContent || ''
                    }
                }));
            });
        }
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Renderer
// ─────────────────────────────────────────────────────────────────────────────

const errorRenderer: AparteSegmentRenderer<AparteErrorSegment> = {
    type: 'error',
    render: (segment) => {
        // A registered error renderer (AparteConfig.setErrorRenderer) owns the error
        // UI — the one place to customize it, string or live HTMLElement.
        const custom = contextConfig().getErrorRenderer?.();
        if (custom) {
            const out = custom({ message: segment.content, details: segment.details });
            if (out instanceof HTMLElement) {
                // Tag the root so in-place segment updates can still target it.
                out.setAttribute('data-segment-id', segment.id);
                return out;
            }
            return out;
        }
        return `
        <div class="segment segment-error" data-segment-id="${escapeHtml(segment.id)}">
            <div class="error-icon-wrapper">
                ${contextConfig().getIcon('error') || '⚠'}
            </div>
            <div class="error-content">
                <div class="error-title">Error</div>
                <div class="error-message">${escapeHtml(segment.content)}</div>
                ${segment.details ? `<div class="error-details">${escapeHtml(segment.details)}</div>` : ''}
            </div>
        </div>
    `;
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Progress Renderer
// ─────────────────────────────────────────────────────────────────────────────

const progressRenderer: AparteSegmentRenderer<AparteProgressSegment> = {
    type: 'progress',
    render: (segment) => {
        const label = escapeHtml(segment.label || 'Progress');
        const pct = Math.round(segment.percent || 0);
        return `<div class="segment segment-progress" data-segment-id="${escapeHtml(segment.id)}"><div class="progress-header"><span class="progress-label">${label}</span><span class="progress-value">${pct}%</span></div><div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${label}"><div class="progress-fill" style="width: ${pct}%"></div></div></div>`;
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// File Tree Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderFileNode(node: AparteFileNode, depth = 0): string {
    const indent = depth * 16;
    const icon = node.type === 'directory' ? '📁' : '📄';
    const statusClass = node.status ? `file-status-${escapeHtml(node.status)}` : '';

    let html = `<div class="file-node ${statusClass}" style="padding-left: ${indent}px"><span class="file-icon">${icon}</span><span class="file-name">${escapeHtml(node.name)}</span></div>`;

    if (node.children) {
        for (const child of node.children) {
            html += renderFileNode(child, depth + 1);
        }
    }

    return html;
}

const fileTreeRenderer: AparteSegmentRenderer<AparteFileTreeSegment> = {
    type: 'file-tree',
    render: (segment) => {
        let filesHtml = '';
        if (segment.files) {
            for (const file of segment.files) {
                filesHtml += renderFileNode(file, 0);
            }
        }

        return `<div class="segment segment-file-tree" data-segment-id="${escapeHtml(segment.id)}">${segment.title ? `<div class="file-tree-title">${escapeHtml(segment.title)}</div>` : ''}<div class="file-tree-content">${filesHtml}</div></div>`;
    },
    getStyles: () => ``
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Renderer (default — shown when no per-tool renderer is registered)
// ─────────────────────────────────────────────────────────────────────────────

const toolCallRenderer: AparteSegmentRenderer = {
    type: 'tool_call',
    render: (segment: any) => {
        const name = segment.toolCall?.name ?? 'tool';
        const status = segment.status ?? 'pending';
        const toolCallId = segment.toolCall?.id ?? '';

        // Human-in-the-loop gate — built-in Approve/Reject. Shown even when a
        // per-tool renderer exists: approval precedes the tool's own UI.
        if (status === 'awaiting-approval') {
            const loc = contextConfig().getLocale();
            const approve = loc.approveTool ?? 'Approve';
            const reject = loc.rejectTool ?? 'Reject';
            return `
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="awaiting-approval" data-tool-call-id="${escapeAttr(toolCallId)}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                </span>
                <span class="tool-approval" role="group" aria-label="${escapeAttr(name)}">
                    <button type="button" class="tool-approve-btn" data-tool-decision="approve" aria-label="${escapeAttr(approve)}">${escapeHtml(approve)}</button>
                    <button type="button" class="tool-reject-btn" data-tool-decision="reject" aria-label="${escapeAttr(reject)}">${escapeHtml(reject)}</button>
                </span>
            </div>
            `;
        }

        // Delegate to a per-tool renderer if one is registered
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        if (customRenderer) {
            const html = customRenderer.render(segment);
            if (html) return html;
        }

        // Status/tool glyphs come from the icon provider (fallbacks: ✓ / ✕ / 🔧)
        // so icon packs and skins restyle the pill like everything else.
        const statusIcon = status === 'resolved' ? contextConfig().getIcon('check') : (status === 'aborted' || status === 'rejected') ? contextConfig().getIcon('close') : '';
        const spinner = status === 'pending'
            ? `<span class="tool-pill-spinner" aria-hidden="true"></span>`
            : '';
        return `
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${status}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                    ${spinner}
                    ${statusIcon ? `<span class="tool-pill-status">${statusIcon}</span>` : ''}
                </span>
            </div>
        `;
    },
    setup: (element: HTMLElement, segment: any) => {
        // Built-in approval gate: wire Approve/Reject → aparte-tool-decision.
        if (segment.status === 'awaiting-approval') {
            const toolCallId = segment.toolCall?.id;
            if (!toolCallId) return;
            const decide = (approved: boolean) => element.dispatchEvent(new CustomEvent('aparte-tool-decision', {
                bubbles: true, composed: true, detail: { toolCallId, approved }
            }));
            element.querySelector('[data-tool-decision="approve"]')?.addEventListener('click', () => decide(true));
            element.querySelector('[data-tool-decision="reject"]')?.addEventListener('click', () => decide(false));
            return;
        }
        // Delegate setup to per-tool renderer if registered
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        customRenderer?.setup?.(element, segment);
    },
    getStyles: () => `
        .segment-tool-call { display: flex; padding: 2px 0; }
        .tool-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px 3px 7px;
            border-radius: 99px;
            font-size: 0.78rem;
            font-weight: 500;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            background: var(--aparte-surface, #f8f8f8);
            color: var(--aparte-text-secondary, rgba(0,0,0,0.55));
            user-select: none;
        }
        [data-status="resolved"] .tool-pill {
            border-color: var(--aparte-success-border, rgba(34,197,94,0.3));
            background: var(--aparte-success-surface, rgba(34,197,94,0.06));
            color: var(--aparte-success, rgb(21,128,61));
        }
        [data-status="aborted"] .tool-pill,
        [data-status="rejected"] .tool-pill {
            border-color: var(--aparte-error-border, rgba(239,68,68,0.3));
            background: var(--aparte-error-surface, rgba(239,68,68,0.06));
            color: var(--aparte-error, rgb(185,28,28));
        }
        .tool-approval { display: inline-flex; gap: 6px; margin-left: 8px; vertical-align: middle; }
        .tool-approve-btn, .tool-reject-btn {
            font: inherit; font-size: 0.78rem; font-weight: 600; line-height: 1;
            padding: 4px 12px; border-radius: 99px; cursor: pointer;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            background: var(--aparte-surface, #f8f8f8);
        }
        .tool-approve-btn { color: var(--aparte-success, rgb(21,128,61)); border-color: var(--aparte-success-border, rgba(34,197,94,0.4)); }
        .tool-reject-btn { color: var(--aparte-error, rgb(185,28,28)); border-color: var(--aparte-error-border, rgba(239,68,68,0.4)); }
        .tool-approve-btn:hover { background: var(--aparte-success-surface, rgba(34,197,94,0.1)); }
        .tool-reject-btn:hover { background: var(--aparte-error-surface, rgba(239,68,68,0.1)); }
        .tool-pill-spinner {
            width: 10px; height: 10px;
            border: 1.5px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: tool-spin 0.7s linear infinite;
        }
        .tool-pill-status { font-size: 0.75rem; }
        @keyframes tool-spin { to { transform: rotate(360deg); } }
    `
};

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Waiting Renderer — pulsing dots between pipeline phases
// ─────────────────────────────────────────────────────────────────────────────

const pipelineWaitingRenderer: AparteSegmentRenderer = {
    type: 'pipeline-waiting',
    render: (segment) => {
        return `
        <div class="segment segment-pipeline-waiting" data-segment-id="${escapeHtml(segment.id)}" aria-label="Generating…" role="status">
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
        </div>`;
    },
    update: () => { /* nothing to update */ },
    setup: (el) => {
        // Auto-remove when a sibling segment appears after this element.
        // This makes it a true "last-child only" segment — no manual removeSegment needed.
        const parent = el.parentElement;
        if (!parent) return;
        const observer = new MutationObserver(() => {
            if (el.nextElementSibling) {
                observer.disconnect();
                el.remove();
            }
        });
        observer.observe(parent, { childList: true });
    },
    getStyles: () => `
        .segment-pipeline-waiting {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 6px 2px;
            min-height: 28px;
        }
        .pw-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--aparte-text-muted, #6b7280);
            opacity: 0.3;
            animation: pw-pulse 1.2s ease-in-out infinite;
        }
        .pw-dot:nth-child(2) { animation-delay: 0.2s; }
        .pw-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pw-pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
            40%            { opacity: 1;   transform: scale(1.1);  }
        }
    `
};

export function registerDefaultRenderers(): void {
    registerSegmentRenderer(textRenderer);
    registerSegmentRenderer(thinkingRenderer);
    registerSegmentRenderer(codeRenderer);
    registerSegmentRenderer(terminalRenderer);
    registerSegmentRenderer(errorRenderer);
    registerSegmentRenderer(progressRenderer);
    registerSegmentRenderer(fileTreeRenderer);
    registerSegmentRenderer(toolCallRenderer);
    registerSegmentRenderer(artifactRenderer);
    registerSegmentRenderer(pipelineWaitingRenderer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact Renderer — INLINE CARD with Code/Preview tabs
//
// Replaces the previous "pill that opens a side panel" UX. The artifact now
// lives directly inside the chat as a card the user can interact with:
//   - Code tab:    syntax-highlighted source (always available)
//   - Preview tab: sandboxed iframe (only for previewable kinds)
//   - Actions:     copy, download
//
// During streaming the Code tab is active and the iframe is not built. As soon
// as `isStreaming` flips to false, the card switches to Preview (when
// previewable) and lazily builds the srcdoc.
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEWABLE_KINDS: ReadonlySet<string> = new Set(['react', 'html', 'svg', 'js', 'css']);
/** Binary file kinds — output of orchestrator's sandbox path. They are
 *  code-only here (downloaded by FileGenService listener side-channel). */
const BINARY_FILE_KINDS: ReadonlySet<string> = new Set(['pdf', 'xlsx', 'docx']);

const artifactRenderer: AparteSegmentRenderer<AparteArtifactSegment> = {
    type: 'artifact',
    render: (segment: AparteArtifactSegment) => {
        const kind = (segment.artifactType || 'unknown').toLowerCase();
        // Binary file kinds (xlsx/pdf/docx) follow a separate UX track : the
        // generated JS is implementation noise the user doesn't care about,
        // so we hide it. Streaming → terminal-like progress, then
        // `aparte-file-gen-ready` swaps to a file card with download + preview.
        if (BINARY_FILE_KINDS.has(kind)) {
            return renderBinaryFileArtifact(segment, kind);
        }
        const title = segment.title?.trim() || labelForKind(kind);
        const displayLang = languageForKind(kind);
        const isStreaming = !!segment.isStreaming;
        const previewable = PREVIEWABLE_KINDS.has(kind);
        const isBinary = BINARY_FILE_KINDS.has(kind);
        const cleanContent = stripCodeFences(segment.content || '');
        // Default tab: code while streaming OR for non-previewable kinds.
        // Preview otherwise (final stage of a previewable artifact).
        const initialTab: 'code' | 'preview' =
            isStreaming || !previewable ? 'code' : 'preview';

        const buildPreview = contextConfig().getArtifactPreviewBuilder() ?? buildSafePreviewDocument;
        const previewSrcdoc = !isStreaming && previewable
            ? buildPreview(kind, cleanContent, title)
            : '';

        return `
            <div class="segment segment-artifact-card"
                 data-segment-id="${escapeHtml(segment.id)}"
                 data-artifact-type="${escapeHtml(kind)}"
                 data-streaming="${isStreaming ? 'true' : 'false'}"
                 data-tab="${initialTab}"
                 data-previewable="${previewable ? 'true' : 'false'}"
                 data-binary="${isBinary ? 'true' : 'false'}">
                <header class="aparte-art-card__header">
                    <div class="aparte-art-card__title-block">
                        <span class="aparte-art-card__kind" data-kind="${escapeHtml(kind)}">${escapeHtml(displayLang)}</span>
                        <span class="aparte-art-card__title">${escapeHtml(title)}</span>
                        ${isStreaming ? '<span class="aparte-art-card__pulse" aria-label="Streaming"></span>' : ''}
                    </div>
                    <div class="aparte-art-card__actions">
                        <button type="button" class="aparte-art-card__btn" data-action="copy" title="${contextConfig().t('copy')}" aria-label="Copy">
                            ${contextConfig().getIcon('copy')}
                        </button>
                        <button type="button" class="aparte-art-card__btn" data-action="download" title="Download" aria-label="Download" ${isStreaming ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9m0 0l-3-3m3 3l3-3M2 13h12"/></svg>
                        </button>
                    </div>
                </header>
                <nav class="aparte-art-card__tabs" role="tablist">
                    ${previewable ? `<button type="button" role="tab" data-tab-target="preview" ${initialTab === 'preview' ? 'aria-selected="true"' : ''} ${isStreaming ? 'disabled' : ''}>Preview</button>` : ''}
                    <button type="button" role="tab" data-tab-target="code" ${initialTab === 'code' ? 'aria-selected="true"' : ''}>Code</button>
                </nav>
                <div class="aparte-art-card__body">
                    <div class="aparte-art-card__pane" data-pane="code">
                        <div class="code-content-wrapper">
                            <pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>
                        </div>
                    </div>
                    ${previewable ? `
                        <div class="aparte-art-card__pane" data-pane="preview">
                            ${previewSrcdoc ? `<iframe class="aparte-art-card__frame" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${escapeHtml(title)}" srcdoc="${escapeAttr(previewSrcdoc)}"></iframe>` : '<div class="aparte-art-card__pending">Generating preview…</div>'}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    setup: (element: HTMLElement, segment: AparteArtifactSegment) => {
        const kind = (segment.artifactType || '').toLowerCase();
        if (BINARY_FILE_KINDS.has(kind)) {
            setupBinaryFileArtifact(element, segment, kind);
            return;
        }
        // Async highlight on the code pane
        const wrapper = element.querySelector('.code-content-wrapper');
        if (wrapper) {
            const displayLang = languageForKind(kind);
            const cleanContent = stripCodeFences(segment.content || '');
            contextConfig().highlightCode(cleanContent, displayLang).then(html => {
                wrapper.innerHTML = html;
            });
        }

        // Tab switching
        element.querySelectorAll<HTMLButtonElement>('[data-tab-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab-target');
                if (!target) return;
                element.setAttribute('data-tab', target);
                element.querySelectorAll<HTMLButtonElement>('[data-tab-target]').forEach(b => {
                    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
                });
            });
        });

        // Copy
        const copyBtn = element.querySelector<HTMLButtonElement>('[data-action="copy"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — resolve from the element.
                const code = stripCodeFences(segment.content || '');
                navigator.clipboard.writeText(code);
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = original;
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }

        // Download — emits aparte-artifact-download for the host app to handle
        // (binary kinds are handled by FileGenService side-channel; for
        // previewable/text kinds we trigger a download from raw content).
        const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                if (dlBtn.disabled) return;
                const kind = (segment.artifactType || '').toLowerCase();
                const isBinary = BINARY_FILE_KINDS.has(kind);
                if (isBinary) {
                    // Re-dispatch the artifact-ready event so FileGenService
                    // re-runs the sandbox and downloads the file.
                    element.dispatchEvent(new CustomEvent('aparte-artifact-redownload', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            segmentId: segment.id,
                            mimeType: segment.mimeType,
                            artifactType: segment.artifactType,
                            title: segment.title,
                            content: stripCodeFences(segment.content || ''),
                        },
                    }));
                    return;
                }
                downloadTextArtifact(segment);
            });
        }
    },
    update: (element: HTMLElement, segment: AparteArtifactSegment) => {
        const isStreaming = !!segment.isStreaming;
        const kind = (segment.artifactType || '').toLowerCase();
        if (BINARY_FILE_KINDS.has(kind)) {
            updateBinaryFileArtifact(element, segment, isStreaming);
            return;
        }
        const previewable = PREVIEWABLE_KINDS.has(kind);
        const wasStreaming = element.getAttribute('data-streaming') === 'true';
        const cleanContent = stripCodeFences(segment.content || '');

        // 1. Live-update the code pane during streaming
        const codeEl = element.querySelector('.code-content-wrapper code');
        if (codeEl) {
            codeEl.textContent = cleanContent;
        } else {
            const wrapper = element.querySelector('.code-content-wrapper');
            if (wrapper) {
                const displayLang = languageForKind(kind);
                wrapper.innerHTML = `<pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>`;
            }
        }
        // Debounced syntax-highlight during streaming so the user sees
        // colors progressively rather than only at stream-end.
        if (isStreaming) {
            const segId = element.getAttribute('data-segment-id') ?? segment.id;
            debounceHighlight(element, '.code-content-wrapper', cleanContent, languageForKind(kind), segId);
        }

        // 2. On stream-completion: highlight + build preview iframe + auto-switch
        if (wasStreaming && !isStreaming) {
            element.setAttribute('data-streaming', 'false');

            // Re-run syntax highlight now that content is final
            const wrapper = element.querySelector('.code-content-wrapper');
            if (wrapper) {
                const displayLang = languageForKind(kind);
                contextConfig().highlightCode(cleanContent, displayLang).then(html => {
                    wrapper.innerHTML = html;
                });
            }

            // Enable previously-disabled buttons (download, preview tab)
            element.querySelectorAll<HTMLButtonElement>('button[disabled]').forEach(b => {
                b.disabled = false;
            });

            // Build preview srcdoc lazily
            if (previewable) {
                const pane = element.querySelector('.aparte-art-card__pane[data-pane="preview"]');
                if (pane) {
                    const title = segment.title?.trim() || labelForKind(kind);
                    const buildPreview = contextConfig().getArtifactPreviewBuilder() ?? buildSafePreviewDocument;
                    const srcdoc = buildPreview(kind, cleanContent, title);
                    pane.innerHTML = `<iframe class="aparte-art-card__frame" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${escapeAttr(title)}" srcdoc="${escapeAttr(srcdoc)}"></iframe>`;
                }
                // Auto-switch to preview only if user hasn't explicitly chosen code
                const currentTab = element.getAttribute('data-tab');
                if (currentTab !== 'code') {
                    element.setAttribute('data-tab', 'preview');
                    element.querySelectorAll<HTMLButtonElement>('[data-tab-target]').forEach(b => {
                        b.setAttribute('aria-selected', b.getAttribute('data-tab-target') === 'preview' ? 'true' : 'false');
                    });
                }
            }
        }
    },
    getStyles: () => `
        .segment-artifact-card {
            display: flex; flex-direction: column;
            margin: 8px 0;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            border-radius: 12px;
            background: var(--aparte-surface, #fff);
            overflow: hidden;
            font: inherit;
            color: var(--aparte-text, inherit);
        }
        .aparte-art-card__header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 10px;
            border-bottom: 1px solid var(--aparte-border, rgba(0,0,0,0.08));
            background: var(--aparte-surface-2, rgba(0,0,0,0.02));
            min-height: 36px;
        }
        .aparte-art-card__title-block { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .aparte-art-card__kind {
            font-size: 0.7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.04em;
            padding: 2px 6px; border-radius: 4px;
            background: var(--aparte-surface, #fff);
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.1));
            color: var(--aparte-text-muted, rgba(0,0,0,0.6));
        }
        .aparte-art-card__title {
            font-size: 0.85rem; font-weight: 500;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .aparte-art-card__pulse {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--aparte-accent, #3b82f6);
            animation: aparte-art-card-pulse 1.2s ease-in-out infinite;
        }
        @keyframes aparte-art-card-pulse {
            0%, 100% { opacity: 0.35; transform: scale(0.85); }
            50%      { opacity: 1;    transform: scale(1.1);  }
        }
        .aparte-art-card__actions { display: flex; gap: 4px; }
        .aparte-art-card__btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 28px; height: 28px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            color: var(--aparte-text-muted, rgba(0,0,0,0.55));
            cursor: pointer;
            transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .aparte-art-card__btn:hover:not(:disabled) {
            background: var(--aparte-surface-hover, rgba(0,0,0,0.04));
            border-color: var(--aparte-border, rgba(0,0,0,0.1));
            color: var(--aparte-text, inherit);
        }
        .aparte-art-card__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .aparte-art-card__tabs {
            display: flex; gap: 2px;
            padding: 4px 8px 0;
            border-bottom: 1px solid var(--aparte-border, rgba(0,0,0,0.08));
            background: var(--aparte-surface-2, rgba(0,0,0,0.02));
        }
        .aparte-art-card__tabs button {
            padding: 6px 12px;
            font-size: 0.78rem;
            background: transparent;
            border: 1px solid transparent;
            border-bottom: none;
            border-radius: 6px 6px 0 0;
            color: var(--aparte-text-muted, rgba(0,0,0,0.6));
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
        }
        .aparte-art-card__tabs button[aria-selected="true"] {
            background: var(--aparte-surface, #fff);
            border-color: var(--aparte-border, rgba(0,0,0,0.08));
            color: var(--aparte-text, inherit);
            font-weight: 500;
        }
        .aparte-art-card__tabs button:disabled { opacity: 0.4; cursor: not-allowed; }
        .aparte-art-card__body {
            position: relative;
            min-height: 80px;
            max-height: 600px;
            overflow: hidden;
        }
        .aparte-art-card__pane { display: none; height: 100%; }
        .segment-artifact-card[data-tab="code"]    .aparte-art-card__pane[data-pane="code"]    { display: block; }
        .segment-artifact-card[data-tab="preview"] .aparte-art-card__pane[data-pane="preview"] { display: block; }
        .aparte-art-card__pane[data-pane="code"] {
            max-height: 600px; overflow: auto;
        }
        .aparte-art-card__pane[data-pane="code"] pre {
            margin: 0; padding: 12px;
            font-size: 0.82rem;
            background: var(--aparte-code-bg, #fafafa);
        }
        .aparte-art-card__frame {
            display: block;
            width: 100%; height: 480px;
            border: 0;
            background: #fff;
        }
        .aparte-art-card__pending {
            display: flex; align-items: center; justify-content: center;
            height: 120px;
            color: var(--aparte-text-muted, rgba(0,0,0,0.5));
            font-size: 0.85rem;
            font-style: italic;
        }
        /* ── Binary file artifact (xlsx/pdf/docx) ──────────────────── */
        .segment-artifact-file {
            display: flex; flex-direction: column;
            margin: 8px 0;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            border-radius: 12px;
            background: var(--aparte-surface, #fff);
            overflow: hidden;
            color: var(--aparte-text, inherit);
            font: inherit;
        }
        .aparte-art-file__card {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 14px;
            background: var(--aparte-surface-2, rgba(0,0,0,0.02));
            border-bottom: 1px solid var(--aparte-border, rgba(0,0,0,0.08));
        }
        .aparte-art-file__body {
            position: relative;
        }
        .aparte-art-file__code-pane {
            max-height: 360px; overflow: auto;
            background: var(--aparte-code-bg, #fafafa);
        }
        .aparte-art-file__code-pane pre {
            margin: 0; padding: 12px;
            font-size: 0.82rem;
            font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
        }
        .aparte-art-file__preview-pane {
            max-height: 460px;
            overflow: auto;
            background: #fff;
            /* Preview is a document view — force light scheme regardless of
               the app theme, with a dark text colour so cells stay readable. */
            color: #1f2937;
        }
        .aparte-art-file__icon {
            width: 40px; height: 40px;
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #1d6f42, #0f5132);
            color: #fff;
            font-weight: 700;
            font-size: 0.78rem;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }
        .aparte-art-file__icon[data-kind="pdf"]  { background: linear-gradient(135deg, #c0392b, #7d1f17); }
        .aparte-art-file__icon[data-kind="docx"] { background: linear-gradient(135deg, #1e5288, #0f3060); }
        .aparte-art-file__meta { flex: 1 1 auto; min-width: 0; }
        .aparte-art-file__meta-name {
            font-weight: 600; font-size: 0.92rem;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .aparte-art-file__meta-sub {
            font-size: 0.78rem;
            color: var(--aparte-text-muted, rgba(0,0,0,0.55));
        }
        .aparte-art-file__actions { display: flex; gap: 6px; flex-shrink: 0; }
        .aparte-art-file__btn {
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            background: var(--aparte-surface, #fff);
            color: var(--aparte-text, inherit);
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.12s ease;
        }
        .aparte-art-file__btn:hover { background: var(--aparte-surface-2, rgba(0,0,0,0.05)); }
        .aparte-art-file__btn--primary {
            background: var(--aparte-primary, #6366f1);
            color: #fff;
            border-color: var(--aparte-primary, #6366f1);
        }
        .aparte-art-file__btn--primary:hover { filter: brightness(1.07); }
        /* Hide the download button until the sandbox has produced the buffer.
           Avoids confusing the user with a disabled-but-styled-primary button
           during streaming / compiling. */
        .segment-artifact-file:not([data-state="ready"]) .aparte-art-file__btn[data-action="download"] {
            display: none;
        }
        .aparte-art-file__preview-pane table {
            border-collapse: collapse;
            width: 100%;
            font-size: 0.82rem;
            font-family: inherit;
        }
        .aparte-art-file__preview-pane th,
        .aparte-art-file__preview-pane td {
            border: 1px solid rgba(0,0,0,0.10);
            padding: 6px 10px;
            text-align: left;
            white-space: nowrap;
            color: #1f2937;
            background: #fff;
        }
        .aparte-art-file__preview-pane tr:nth-child(odd) td { background: #f9fafb; }
        .aparte-art-file__preview-pane tr:first-child td {
            background: #f3f4f6;
            font-weight: 600;
            position: sticky; top: 0;
            color: #111827;
        }
        .aparte-art-file__preview-empty {
            padding: 20px; text-align: center;
            color: var(--aparte-text-muted, rgba(0,0,0,0.5));
            font-size: 0.85rem; font-style: italic;
        }
        .segment-artifact-file[data-state="error"] .aparte-art-file__icon {
            background: linear-gradient(135deg, #c0392b, #7d1f17);
        }
        .aparte-art-file__error {
            padding: 16px 18px;
            background: rgba(239, 68, 68, 0.05);
            border-top: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--aparte-text, inherit);
        }
        .aparte-art-file__error-title {
            font-weight: 600;
            font-size: 0.9rem;
            margin-bottom: 6px;
            color: #b91c1c;
        }
        .aparte-art-file__error-msg {
            font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
            font-size: 0.78rem;
            padding: 6px 10px;
            background: rgba(0,0,0,0.04);
            border-radius: 4px;
            margin-bottom: 8px;
            color: #7f1d1d;
            word-break: break-word;
        }
        .aparte-art-file__error-hint {
            font-size: 0.78rem;
            color: var(--aparte-text-muted, rgba(0,0,0,0.55));
            font-style: italic;
        }
    `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Binary file artifact helpers (xlsx/pdf/docx)
// ─────────────────────────────────────────────────────────────────────────────

const FILE_ICON_LABEL: Record<string, string> = {
    xlsx: 'XLS',
    pdf:  'PDF',
    docx: 'DOC',
};

/**
 * Module-level cache of sandbox-produced previews keyed by segment.id.
 * Lets re-mounts (branch switch, conversation toggle, persisted reload after
 * a previous mount) restore the preview instantly without re-running the
 * sandbox. Lifetime = current page session; cleared on full reload.
 */
type CachedPreview = {
    buffer: Uint8Array | ArrayBuffer;
    mime: string;
    name: string;
    bytes: number;
    previewHtml: string | null;
};
const _binaryArtifactCache = new Map<string, CachedPreview>();
/** segmentId → cleanup for the file-gen window listeners (one live pair/segment). */
const _fileGenHandlers = new Map<string, () => void>();

/**
 * Tracks when an `aparte-artifact-ready` was last dispatched per segment, so
 * setup() rehydration doesn't fire a duplicate dispatch while a previous
 * sandbox run is still in flight (would trigger "Sandbox is busy" errors).
 * Populated both by aparte-client's natural dispatch (hook below) AND by our
 * own rehydration dispatches.
 */
const _lastDispatchAt = new Map<string, number>();
const RE_DISPATCH_DEBOUNCE_MS = 30_000;

/**
 * Debounced syntax-highlight during streaming. Re-running Shiki on every
 * token chunk would saturate the main thread (50-100ms/highlight × 10
 * chunks/sec). We coalesce to one highlight every ~400ms, plus a final
 * highlight at stream-end (handled by the caller).
 */
const _lastHighlightAt = new Map<string, number>();
const HIGHLIGHT_DEBOUNCE_MS = 400;

function debounceHighlight(
    element: HTMLElement,
    paneSelector: string,
    content: string,
    lang: string,
    segId: string,
): void {
    const now = Date.now();
    const last = _lastHighlightAt.get(segId) ?? 0;
    if (now - last < HIGHLIGHT_DEBOUNCE_MS) return;
    _lastHighlightAt.set(segId, now);
    // May run from a window-event callback (late) — resolve from the element.
    contextConfig(element).highlightCode(content, lang).then(html => {
        const wrapper = element.querySelector<HTMLElement>(paneSelector);
        if (wrapper) wrapper.innerHTML = html;
    });
}

if (typeof window !== 'undefined') {
    // Single shared hook — runs once on module load. Records every
    // `aparte-artifact-ready` whoever dispatched it.
    window.addEventListener('aparte-artifact-ready', (event: Event) => {
        const segId = (event as CustomEvent).detail?.segmentId as string | undefined;
        if (segId) _lastDispatchAt.set(segId, Date.now());
    });
}

function renderBinaryFileArtifact(segment: AparteArtifactSegment, kind: string): string {
    const title = segment.title?.trim() || labelForKind(kind);
    const iconLabel = FILE_ICON_LABEL[kind] ?? kind.toUpperCase();
    const isStreaming = !!segment.isStreaming;

    // Cache hit (branch switch back, re-render of an already-built segment) :
    // render in 'ready' state with the preview HTML so the user sees the
    // file immediately — no setup() round-trip required, which matters when
    // Angular reuses the DOM via trackBy and our setup may not re-fire.
    const cached = _binaryArtifactCache.get(segment.id);
    if (cached && !isStreaming) {
        const previewBody = cached.previewHtml
            ? contextConfig().sanitizeHtml(cached.previewHtml)
            : `<div class="aparte-art-file__preview-empty">Preview not available for ${escapeHtml(kind)} yet</div>`;
        return `
            <div class="segment segment-artifact-file"
                 data-segment-id="${escapeHtml(segment.id)}"
                 data-artifact-type="${escapeHtml(kind)}"
                 data-state="ready">
                <div class="aparte-art-file__card">
                    <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                    <div class="aparte-art-file__meta">
                        <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(cached.name)}</div>
                        <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(formatBytes(cached.bytes))} · ${escapeHtml(kind.toUpperCase())}</div>
                    </div>
                    <div class="aparte-art-file__actions">
                        <button type="button" class="aparte-art-file__btn aparte-art-file__btn--primary" data-action="download">Download</button>
                    </div>
                </div>
                <div class="aparte-art-file__body">
                    <div class="aparte-art-file__code-pane" data-role="code-pane" hidden>
                        <pre><code class="language-js"></code></pre>
                    </div>
                    <div class="aparte-art-file__preview-pane" data-role="preview-pane">${previewBody}</div>
                </div>
            </div>
        `;
    }

    const cleanContent = stripCodeFences(segment.content || '');
    const subText = isStreaming ? 'Generating…' : 'Rebuilding preview…';
    return `
        <div class="segment segment-artifact-file"
             data-segment-id="${escapeHtml(segment.id)}"
             data-artifact-type="${escapeHtml(kind)}"
             data-state="${isStreaming ? 'streaming' : 'compiling'}">
            <div class="aparte-art-file__card">
                <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                <div class="aparte-art-file__meta">
                    <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(title)}</div>
                    <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(subText)}</div>
                </div>
                <div class="aparte-art-file__actions">
                    <button type="button" class="aparte-art-file__btn aparte-art-file__btn--primary" data-action="download" disabled>Download</button>
                </div>
            </div>
            <div class="aparte-art-file__body">
                <div class="aparte-art-file__code-pane" data-role="code-pane">
                    <pre><code class="language-js">${escapeHtml(cleanContent)}</code></pre>
                </div>
                <div class="aparte-art-file__preview-pane" data-role="preview-pane" hidden></div>
            </div>
        </div>
    `;
}

function setupBinaryFileArtifact(element: HTMLElement, segment: AparteArtifactSegment, kind: string): void {
    // Per-element click handler reads the live cache entry so the Download
    // button works regardless of whether the buffer came from a fresh run or
    // from the module cache (branch switch / re-mount).
    if (element.dataset['aparteInit'] !== 'true') {
        element.dataset['aparteInit'] = 'true';

        // A branch switch replaces this element with a fresh one (aparteInit
        // unset), so setup runs again for the same segment id. Drop the prior
        // element's listeners first — one live pair per segment id — otherwise
        // the detached element leaks (its handlers keep it referenced forever).
        _fileGenHandlers.get(segment.id)?.();
        const cleanup = (): void => {
            window.removeEventListener('aparte-file-gen-ready', onReady);
            window.removeEventListener('aparte-file-gen-error', onError);
            _fileGenHandlers.delete(segment.id);
        };

        const onReady = (event: Event): void => {
            const detail = (event as CustomEvent).detail as {
                segmentId: string;
                filename: string;
                bytes: number;
                mime: string;
                buffer: Uint8Array | ArrayBuffer;
                previewHtml: string | null;
            };
            if (!detail || detail.segmentId !== segment.id) return;
            _binaryArtifactCache.set(segment.id, {
                buffer: detail.buffer,
                mime: detail.mime,
                name: detail.filename,
                bytes: detail.bytes,
                previewHtml: detail.previewHtml,
            });
            swapToPreview(element, detail, kind);
            cleanup(); // terminal — generation delivered
        };
        window.addEventListener('aparte-file-gen-ready', onReady);

        // Sandbox failed — show an inline error in the card so the user gets
        // feedback instead of an indefinite "Running sandbox…" spinner. The
        // model often emits buggy code (drawText with array, undefined font
        // refs, etc.) — we surface that rather than hide it.
        const onError = (event: Event): void => {
            const detail = (event as CustomEvent).detail as {
                segmentId: string;
                phase?: string;
                error?: string;
            };
            if (!detail || detail.segmentId !== segment.id) return;
            showSandboxError(element, detail.phase ?? 'exec', detail.error ?? 'Unknown error');
            cleanup(); // terminal — generation failed
        };
        window.addEventListener('aparte-file-gen-error', onError);
        _fileGenHandlers.set(segment.id, cleanup);

        element.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const action = target.closest<HTMLElement>('[data-action]')?.getAttribute('data-action');
            if (action !== 'download') return;
            const cached = _binaryArtifactCache.get(segment.id);
            if (!cached) return;
            const blob = new Blob([cached.buffer as BlobPart], { type: cached.mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = cached.name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    // ─── Rehydration : runs on EVERY setup() call. ──────────────────
    const currentState = element.getAttribute('data-state');
    if (segment.isStreaming || currentState === 'ready') return;

    // Cache hit (branch switch back, conversation toggle) → swap instantly,
    // no sandbox re-run.
    const cached = _binaryArtifactCache.get(segment.id);
    if (cached) {
        swapToPreview(
            element,
            { filename: cached.name, bytes: cached.bytes, previewHtml: cached.previewHtml },
            kind,
        );
        return;
    }

    // Dedupe : if an artifact-ready was dispatched recently for this segment
    // (either by aparte-client's natural stream-end flow OR by a previous
    // rehydration), don't fire another one — the sandbox is in flight and
    // the file-gen-ready listener will catch the result soon. Without this
    // we'd hit "Sandbox is busy with a previous execution" errors.
    const lastAt = _lastDispatchAt.get(segment.id) ?? 0;
    if (Date.now() - lastAt < RE_DISPATCH_DEBOUNCE_MS) return;
    _lastDispatchAt.set(segment.id, Date.now());

    // First time we see this segment in the current page session : kick off
    // the sandbox via FileGenService. Date.now() in the messageId bypasses
    // its `${msgId}::${segId}` dedupe so the event always reaches us.
    const reloadMessageId = `__reload__${Date.now()}`;
    queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('aparte-artifact-ready', {
            detail: {
                messageId: reloadMessageId,
                segmentId: segment.id,
                mimeType: segment.mimeType,
                artifactType: segment.artifactType,
                title: segment.title,
                content: stripCodeFences(segment.content || ''),
            },
        }));
    });
    // Re-highlight the code (visible until the sandbox finishes).
    const wrapper = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (wrapper) {
        const cleanContent = stripCodeFences(segment.content || '');
        contextConfig(element).highlightCode(cleanContent, 'js').then(html => {
            wrapper.innerHTML = html;
        });
    }
}

function updateBinaryFileArtifact(element: HTMLElement, segment: AparteArtifactSegment, isStreaming: boolean): void {
    const state = element.getAttribute('data-state');
    // Once we've swapped to preview we don't touch the body again.
    if (state === 'ready') return;

    const cleanContent = stripCodeFences(segment.content || '');
    // Live-update the streaming code via textContent (cheap), then schedule
    // a debounced syntax-highlight so colors appear progressively without
    // saturating the main thread.
    const codeEl = element.querySelector<HTMLElement>('[data-role="code-pane"] code');
    if (codeEl) {
        codeEl.textContent = cleanContent;
    }
    if (isStreaming) {
        debounceHighlight(element, '[data-role="code-pane"]', cleanContent, 'js', segment.id);
    }

    if (!isStreaming && state === 'streaming') {
        element.setAttribute('data-state', 'compiling');
        // Re-highlight once the code is final. The pane stays visible until
        // `aparte-file-gen-ready` fires and swapToPreview() flips it.
        const wrapper = element.querySelector<HTMLElement>('[data-role="code-pane"]');
        if (wrapper) {
            contextConfig(element).highlightCode(cleanContent, 'js').then(html => {
                wrapper.innerHTML = html;
            });
        }
        const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
        if (sub) sub.textContent = 'Running sandbox…';
    }
}

function swapToPreview(
    element: HTMLElement,
    detail: { filename: string; bytes: number; previewHtml: string | null },
    kind: string,
): void {
    element.setAttribute('data-state', 'ready');

    // Replace the code pane with the file preview.
    const codePane = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (codePane) codePane.hidden = true;
    const preview = element.querySelector<HTMLElement>('[data-role="preview-pane"]');
    if (preview) {
        // previewHtml comes from the app (e.g. SheetJS table for xlsx) and is built
        // from potentially untrusted file bytes, so route it through the sanitizer
        // like every other innerHTML in this file (renderMarkdown/highlightCode do).
        preview.innerHTML = detail.previewHtml
            ? contextConfig().sanitizeHtml(detail.previewHtml)
            : `<div class="aparte-art-file__preview-empty">Preview not available for ${escapeHtml(kind)} yet</div>`;
        preview.hidden = false;
    }

    // Update the footer card to its "ready" state.
    const nameEl = element.querySelector<HTMLElement>('[data-role="file-name"]');
    if (nameEl) nameEl.textContent = detail.filename;
    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = `${formatBytes(detail.bytes)} · ${kind.toUpperCase()}`;
    const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
    if (dlBtn) dlBtn.disabled = false;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function showSandboxError(element: HTMLElement, phase: string, errorMsg: string): void {
    // Don't clobber a successful preview — only flip to error if still
    // pre-ready (streaming/compiling).
    const state = element.getAttribute('data-state');
    if (state === 'ready') return;
    element.setAttribute('data-state', 'error');

    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = `Error (${phase})`;

    const body = element.querySelector<HTMLElement>('.aparte-art-file__body');
    if (body) {
        // Truncate gnarly stack traces — first line is usually the actionable bit.
        const short = (errorMsg.split('\n')[0] ?? '').slice(0, 240);
        body.innerHTML = `
            <div class="aparte-art-file__error">
                <div class="aparte-art-file__error-title">The sandbox failed during generation.</div>
                <div class="aparte-art-file__error-msg">${escapeHtml(short)}</div>
                <div class="aparte-art-file__error-hint">Common cause: the model produced invalid code (undefined variable, wrong argument type). Retry the request — the model may produce different code.</div>
            </div>
        `;
    }
}

function labelForKind(kind: string): string {
    switch (kind) {
        case 'react': return 'React component';
        case 'html': return 'HTML document';
        case 'svg': return 'SVG image';
        case 'js': return 'JavaScript snippet';
        case 'css': return 'CSS stylesheet';
        case 'json': return 'JSON document';
        case 'markdown': return 'Markdown document';
        case 'csv': return 'CSV table';
        case 'text': return 'Text file';
        case 'python': return 'Python script';
        case 'typescript': return 'TypeScript file';
        case 'bash': return 'Bash script';
        case 'sql': return 'SQL query';
        case 'pdf': return 'PDF generator';
        case 'xlsx': return 'Excel generator';
        case 'docx': return 'Word generator';
        default: return 'Artifact';
    }
}

function languageForKind(kind: string): string {
    if (kind === 'react') return 'jsx';
    if (kind === 'markdown') return 'md';
    if (kind === 'pdf' || kind === 'xlsx' || kind === 'docx') return 'js';
    return kind || 'text';
}

function downloadTextArtifact(segment: AparteArtifactSegment): void {
    const content = stripCodeFences(segment.content || '');
    const kind = (segment.artifactType || '').toLowerCase();
    const ext = ({
        react: 'jsx', html: 'html', svg: 'svg', js: 'js', css: 'css',
        json: 'json', markdown: 'md', csv: 'csv', text: 'txt',
        python: 'py', typescript: 'ts', bash: 'sh', sql: 'sql',
    } as Record<string, string>)[kind] ?? 'txt';
    const baseTitle = (segment.title ?? labelForKind(kind)).trim();
    const safeBase = slugifyForFilename(baseTitle) || 'artifact';
    const filename = `${safeBase}.${ext}`;
    const mime = segment.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Char-based helpers (no regex) ───────────────────────────────────────────

function escapeAttr(s: string): string {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '&') out += '&amp;';
        else if (ch === '"') out += '&quot;';
        else if (ch === '<') out += '&lt;';
        else if (ch === '>') out += '&gt;';
        else if (ch === "'") out += '&#039;';
        else out += ch;
    }
    return out;
}

function slugifyForFilename(text: string): string {
    const lower = text.trim().toLowerCase();
    let out = '';
    let prevDash = false;
    for (let i = 0; i < lower.length && out.length < 40; i++) {
        const ch = lower[i]!;
        const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
        if (isAlnum) { out += ch; prevDash = false; continue; }
        if (!prevDash && out.length > 0) { out += '-'; prevDash = true; }
    }
    if (out.endsWith('-')) out = out.slice(0, -1);
    return out;
}

// ─── Preview document builder (CDN-FREE offline fallback) ────────────────────
// Core ships only an OFFLINE-safe preview: svg/css/html/js render with zero
// network, and richer kinds (react/…) degrade to a read-only code view. The
// product opts into a CDN-powered live preview (React/Babel/Tailwind) by
// registering a builder via `AparteConfig.setArtifactPreviewBuilder()`. Core must
// stay framework-agnostic and zero-network, so no CDN URLs live here.

function buildSafePreviewDocument(kind: string, body: string, title: string): string {
    switch (kind) {
        case 'html': {
            if (startsWithDoctype(body)) return body;
            return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeAttr(title)}</title></head><body>${body}</body></html>`;
        }
        case 'svg':
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:90%;max-height:90%}</style>
</head><body>${body}</body></html>`;
        case 'js': {
            const safeBody = escapeClosingScriptTag(body);
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;padding:1rem;background:#fff;color:#0f172a}</style>
</head><body><div id="root"></div><script>
try { ${safeBody}
} catch (e) { document.getElementById('root').innerHTML = '<pre style="color:#b91c1c">' + (e && e.stack || e) + '</pre>'; }
</script></body></html>`;
        }
        case 'css':
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>${body}</style></head><body>
<div class="demo">
  <h1>Heading</h1>
  <p>Paragraph with a <a href="#">link</a> and <strong>strong</strong> text.</p>
  <button>Button</button>
  <input placeholder="Input"/>
  <ul><li>One</li><li>Two</li><li>Three</li></ul>
</div></body></html>`;
        default:
            // react / unknown — no live preview offline; show the code read-only.
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>body{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:1rem;background:#fff;color:#0f172a}pre{white-space:pre-wrap;word-break:break-word;margin:0}</style>
</head><body><pre>${escapeHtml(body)}</pre></body></html>`;
    }
}

/** Char-based check for `<!doctype` (case-insensitive) at start of string,
 *  ignoring leading whitespace. */
function startsWithDoctype(s: string): boolean {
    let i = 0;
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
    const probe = s.slice(i, i + 9).toLowerCase();
    return probe === '<!doctype';
}

/** Escape any literal `</script` inside the body so it cannot terminate the
 *  outer <script> tag we wrap user code in. The HTML spec closes a script on
 *  `</script` followed by whitespace, `/` or `>` (not only the exact `</script>`),
 *  so match the 8-char prefix + a terminator. Char-based. */
function escapeClosingScriptTag(body: string): string {
    let out = '';
    let i = 0;
    while (i < body.length) {
        if (body[i] === '<' && body.slice(i, i + 8).toLowerCase() === '</script') {
            const next = body[i + 8];
            // A real closing tag needs a terminator after `</script` (space/tab/
            // newline/form-feed, `/`, `>`) or end-of-input.
            if (next === undefined || next === '/' || next === '>' || /\s/.test(next)) {
                out += '<\\/script'; // neutralise the `<` so the browser sees no tag
                i += 8;
                continue;
            }
        }
        out += body[i];
        i++;
    }
    return out;
}
