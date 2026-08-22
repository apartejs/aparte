/**
 * Aparte Segment Renderers
 * Built-in renderers for core segment types
 */

import type {
    AparteSegmentBase,
    AparteSegmentRenderer,
} from '../types/index.js';
// Renderers are plain functions: they read the ambient config set by the
// invoking component (runWithConfig), falling back to an element when one is
// in scope for late executions (event handlers, window-event callbacks) —
// see config-context.ts. `contextConfig()` with no element = ambient or global.
import { contextConfig } from '../config/index.js';
import type { AparteConfig } from '../config/index.js';
// The artifact card — the one renderer big enough to have its own file, plus the
// two paths it delegates to.
// The nine built-in renderers, one file each under ./segments/. This module is the
// REGISTRY: it owns which renderer draws which segment type, per config, and the
// style injection they share. It knows nothing about how any of them render.
import { textRenderer } from './segments/text.js';
import { thinkingRenderer } from './segments/thinking.js';
import { codeRenderer } from './segments/code.js';
import { terminalRenderer } from './segments/terminal.js';
import { errorRenderer } from './segments/error.js';
import { progressRenderer } from './segments/progress.js';
import { fileTreeRenderer } from './segments/file-tree.js';
import { toolCallRenderer } from './segments/tool-call.js';
import { pipelineWaitingRenderer } from './segments/pipeline-waiting.js';
import { artifactRenderer } from './segments/artifact/card.js';
// The binary path's bookkeeping hook. Installed from the two registration entry
// points below rather than at module load — see its own comment for why a bundler
// makes that difference matter.
import { installArtifactReadyHook } from './segments/artifact/binary-file.js';

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



// ─────────────────────────────────────────────────────────────────────────────
// Thinking Renderer
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Code Renderer
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Terminal Renderer
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Error Renderer
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Progress Renderer
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// File Tree Renderer
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Renderer (default — shown when no per-tool renderer is registered)
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Waiting Renderer — pulsing dots between pipeline phases
// ─────────────────────────────────────────────────────────────────────────────


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
