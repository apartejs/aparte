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
    AparteToolCallSegment,
} from '../types/index.js';
// Renderers are plain functions: they read the ambient config set by the
// invoking component (runWithConfig), falling back to an element when one is
// in scope for late executions (event handlers, window-event callbacks) —
// see config-context.ts. `contextConfig()` with no element = ambient or global.
import { contextConfig } from '../config/index.js';
import type { AparteConfig } from '../config/index.js';
import type { AparteStreamingMarkdownRenderer } from '../config/index.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
// The artifact card — the one renderer big enough to have its own file, plus the
// two paths it delegates to.
import { artifactRenderer } from './artifact-card.js';
// The binary path's bookkeeping hook. Installed from the two registration entry
// points below rather than at module load — see its own comment for why a bundler
// makes that difference matter.
import { installArtifactReadyHook } from './artifact-binary-file.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────




// ─────────────────────────────────────────────────────────────────────────────
// Renderer Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One registry PER CONFIG, not one per module.
 *
 * The wrappers all advertise a `config` prop for "several independently configured
 * chats on one page", and until 0.8.0 no plugin could honour it. That was fixed for
 * what a plugin registers on the config — markdown, highlighting, model preferences
 * — but segment renderers stayed in a module-level `Map`, so two chats could not
 * render the same segment type differently. This closes that half.
 *
 * A WeakMap rather than fields on `AparteConfig`: that class is already the
 * largest thing in the package and the audit named its size as the ceiling. Keying
 * the state here keeps it next to the code that reads it, and it is collected with
 * the config it belongs to.
 *
 * `styleElement` stays module-level on purpose — renderer CSS is injected once per
 * DOCUMENT, and two configs on one page share that document.
 */
interface RendererRegistry {
    renderers: Map<string, AparteSegmentRenderer>;
    /** Set once the built-ins have been filled in, so the sweep runs at most once. */
    defaultsInstalled: boolean;
    /** Set when an app explicitly said it brings its own (AparteClient autoRegister: false). */
    defaultsDeclined: boolean;
}

const registries = new WeakMap<AparteConfig, RendererRegistry>();

function registryFor(config: AparteConfig): RendererRegistry {
    let reg = registries.get(config);
    if (!reg) {
        reg = { renderers: new Map(), defaultsInstalled: false, defaultsDeclined: false };
        registries.set(config, reg);
    }
    return reg;
}

let styleElement: HTMLStyleElement | null = null;

/**
 * Register a segment renderer
 */
export function registerSegmentRenderer<T extends AparteSegmentBase>(
    renderer: AparteSegmentRenderer<T>,
    config: AparteConfig = contextConfig(),
): void {
    registryFor(config).renderers.set(renderer.type, renderer as AparteSegmentRenderer);
    injectRendererStyles();
}

/**
 * Remember that the app declined the built-in renderers, so
 * {@link installDefaultRenderersOnce} stays out of the way for good.
 *
 * `AparteClient({ autoRegister: false })` is the one caller. Without this latch the
 * lazy install below would quietly turn that option into a no-op.
 */
export function declineDefaultRenderers(config: AparteConfig = contextConfig()): void {
    registryFor(config).defaultsDeclined = true;
}

/**
 * Fill in the built-in renderers for the types nobody has claimed — called by the
 * bubble the first time a segment has no renderer.
 *
 * Why lazily and not at import time: **`registerDefaultRenderers()` used to have
 * exactly one caller, `new AparteClient()`.** An app on the bring-your-own-loop
 * path — the one the guide tells you not to construct a client on — rendered
 * `[Unknown segment type: text]` for every reply. Bubbles, streaming and scrolling
 * all worked; only the content was missing, which reads as a bug in the consumer's
 * own loop, not as a missing call.
 *
 * Strictly additive: a type someone registered themselves is never replaced, so a
 * custom `text` renderer survives the sweep triggered by a `code` segment.
 */
export function installDefaultRenderersOnce(config: AparteConfig = contextConfig()): void {
    const reg = registryFor(config);
    if (reg.defaultsInstalled || reg.defaultsDeclined) return;
    reg.defaultsInstalled = true;
    for (const renderer of DEFAULT_RENDERERS) {
        if (!reg.renderers.has(renderer.type)) reg.renderers.set(renderer.type, renderer);
    }
    injectRendererStyles();
    installArtifactReadyHook();
}

/**
 * Unregister a segment renderer
 */
export function unregisterSegmentRenderer(type: string, config: AparteConfig = contextConfig()): void {
    registryFor(config).renderers.delete(type);
}

/**
 * Get renderer for a segment type
 */
export function getSegmentRenderer(
    type: string,
    config: AparteConfig = contextConfig(),
): AparteSegmentRenderer | undefined {
    return registryFor(config).renderers.get(type);
}

/**
 * Get all registered renderers
 */
export function getAllRenderers(config: AparteConfig = contextConfig()): readonly AparteSegmentRenderer[] {
    return Array.from(registryFor(config).renderers.values());
}

/**
 * Collect all renderer styles
 */
export function collectRendererStyles(config: AparteConfig = contextConfig()): string {
    return Array.from(registryFor(config).renderers.values())
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
    render: (segment) => `<details class="segment segment-thinking" data-segment-id="${escapeHtml(segment.id)}" ${segment.collapsed ? '' : 'open'}><summary class="thinking-header"><span class="thinking-label">${escapeHtml(segment.label || contextConfig().t('thinking'))}</span><span class="thinking-toggle"></span></summary><div class="thinking-content">${escapeHtml(segment.content)}</div></details>`,
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
                <button class="code-copy" data-action="copy" title="${escapeAttr(contextConfig().t('copy'))}">
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
            void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }

        const copyBtn = element.querySelector('.code-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — the ambient render config is
                // gone; resolve from the connected element instead.
                void navigator.clipboard.writeText(segment.content || '').catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
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
                void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                    wrapper.innerHTML = html;
                }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
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
            : contextConfig().getHostHandlers().terminalRun
                ? `<button class="terminal-run-btn" data-action="run" aria-label="${escapeAttr(contextConfig().t('run'))}" title="${escapeAttr(contextConfig().t('run'))}">${contextConfig().t('run')}</button>`
                : ''}
                    <button class="terminal-copy-btn" data-action="copy" aria-label="${escapeAttr(contextConfig().t('copy'))}" title="${escapeAttr(contextConfig().t('copy'))}">
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
                void navigator.clipboard.writeText(command.textContent || '').catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
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
        // A registered error renderer (aparteGlobalConfig.setErrorRenderer) owns the error
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

const toolCallRenderer: AparteSegmentRenderer<AparteToolCallSegment> = {
    type: 'tool_call',
    render: (segment) => {
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
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                    ${spinner}
                    ${statusIcon ? `<span class="tool-pill-status">${statusIcon}</span>` : ''}
                </span>
            </div>
        `;
    },
    setup: (element, segment) => {
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

export function registerDefaultRenderers(config: AparteConfig = contextConfig()): void {
    registryFor(config).defaultsInstalled = true;
    for (const renderer of DEFAULT_RENDERERS) registerSegmentRenderer(renderer, config);
    installArtifactReadyHook();
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




// ─────────────────────────────────────────────────────────────────────────────
// Binary file artifact helpers (xlsx/pdf/docx)
// ─────────────────────────────────────────────────────────────────────────────


















// ─── Char-based helpers (no regex) ───────────────────────────────────────────



// ─── Preview document builder (CDN-FREE offline fallback) ────────────────────
// Core ships only an OFFLINE-safe preview: svg/css/html/js render with zero
// network, and richer kinds (react/…) degrade to a read-only code view. The
// product opts into a CDN-powered live preview (React/Babel/Tailwind) by
// registering a builder via `aparteGlobalConfig.setArtifactPreviewBuilder()`. Core must
// stay framework-agnostic and zero-network, so no CDN URLs live here.

/**
 * Create the preview frame — the ONLY place it is created, and only ever from a
 * real user press on the Preview tab.
 *
 * Idempotent: pressing Preview, Code, then Preview again reuses the frame rather
 * than re-running the artifact.
 *
 * Two containments, and it is worth being precise about what each buys:
 *   - `sandbox="allow-scripts"` (no allow-same-origin) gives the frame an opaque
 *     origin, so it cannot touch the host page, its DOM, or its storage.
 *   - `csp` shrinks what it can reach OUTWARD — the sandbox alone still allows
 *     `fetch()` to any origin, which is how an injected artifact would exfiltrate
 *     or beacon. Note honestly that the `csp` ATTRIBUTE is Chromium-only; the
 *     portable half is the `<meta http-equiv>` that `buildSafePreviewDocument`
 *     puts inside the documents we build ourselves.
 */



// ─────────────────────────────────────────────────────────────────────────────
// The built-in set
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every renderer core ships. One list, read by both the explicit
 * `registerDefaultRenderers()` and the lazy {@link installDefaultRenderersOnce} —
 * so a new built-in type cannot be added to one path and forgotten in the other.
 */
const DEFAULT_RENDERERS = [
    textRenderer,
    thinkingRenderer,
    codeRenderer,
    terminalRenderer,
    errorRenderer,
    progressRenderer,
    fileTreeRenderer,
    toolCallRenderer,
    artifactRenderer,
    pipelineWaitingRenderer,
] as readonly AparteSegmentRenderer[];
