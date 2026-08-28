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
import { aparteGlobalConfig } from '../config/index.js';
import type { AparteConfig } from '../config/index.js';
// The artifact card — the one renderer big enough to have its own file, plus the
// two paths it delegates to.
// The nine built-in renderers, one file each under ./segments/. This module is the
// REGISTRY: it owns which renderer draws which segment type, per config, and the
// style injection they share. It knows nothing about how any of them render.
import { textRenderer } from './segments/text.js';
import { thinkingRenderer } from './segments/thinking.js';
import { codeRenderer } from './segments/code.js';
import { errorRenderer } from './segments/error.js';
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

/**
 * The renderers a config can actually draw with: its own, plus whatever was
 * registered on the global singleton, with its own winning on a clash.
 *
 * An instance config INHERITS global registrations, and it has to. The documented
 * call is `registerSegmentRenderer(myRenderer)` at app startup — no element, no
 * ambient render config, so `contextConfig()` resolves the global. A chat given a
 * `config` prop then resolved its own registry and found nothing there: the
 * renderer a consumer had registered the only documented way was invisible to
 * every chat that used the feature the `config` prop exists for.
 *
 * A config that DECLINED the built-ins inherits nothing — it said it brings its
 * own everything, and quietly handing it the global's renderers would turn
 * `autoRegister: false` back into a no-op, which is the exact thing the decline
 * latch was added to prevent.
 *
 * Known edge, deliberately not solved: an instance cannot suppress a type that the
 * global registers. That needs a tombstone, and wanting to inherit is far commoner
 * than wanting to subtract.
 */
function effectiveRenderers(config: AparteConfig): Map<string, AparteSegmentRenderer> {
    const own = registryFor(config);
    if (config === aparteGlobalConfig || own.defaultsDeclined) return own.renderers;
    const merged = new Map(registryFor(aparteGlobalConfig).renderers);
    for (const [type, renderer] of own.renderers) merged.set(type, renderer);
    return merged;
}

let styleElement: HTMLStyleElement | null = null;

/**
 * Register a segment renderer.
 *
 * `config` defaults to the ambient render config, which at app startup — no
 * element, no active render — is the global singleton. That is the right default:
 * a chat with its own `config` inherits global registrations. Pass a config
 * explicitly only to give ONE chat a renderer the others must not have.
 */
export function registerSegmentRenderer<T extends AparteSegmentBase>(
    renderer: AparteSegmentRenderer<T>,
    config: AparteConfig = contextConfig(),
): void {
    registryFor(config).renderers.set(renderer.type, renderer as AparteSegmentRenderer);
    injectRendererStyles(config);
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
    injectRendererStyles(config);
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
    return effectiveRenderers(config).get(type);
}

/**
 * Get all registered renderers
 */
export function getAllRenderers(config: AparteConfig = contextConfig()): readonly AparteSegmentRenderer[] {
    return Array.from(effectiveRenderers(config).values());
}

/**
 * Collect all renderer styles for one config.
 *
 * Its OWN renderers, not the inherited view: a config that inherits the global's
 * renderers also inherits their stylesheet, which the global already injected.
 */
export function collectRendererStyles(config: AparteConfig = contextConfig()): string {
    return Array.from(registryFor(config).renderers.values())
        .map(r => r.getStyles?.() || '')
        .filter(Boolean)
        .join('\n');
}

/**
 * Inject a config's renderer styles into the document head.
 *
 * Takes the config, and ACCUMULATES rather than replaces. Both matter.
 *
 * It used to take nothing and assign `collectRendererStyles()` — no argument — so
 * the styles collected were `contextConfig()`'s. At app startup there is no ambient
 * render config, which means the global singleton's: a renderer registered on an
 * instance config wrote into that config's registry and then had the GLOBAL's
 * stylesheet re-emitted over it. The renderer drew, unstyled, and nothing said so.
 *
 * Accumulating (rather than assigning the latest config's sheet) is the other half:
 * one `<style>` serves the whole document, so the second config to register must
 * not erase the first one's rules. Deduped per renderer stylesheet, so the
 * built-ins shared by every config are emitted once.
 */
const injectedRendererStyles = new Set<string>();

export function injectRendererStyles(config: AparteConfig = contextConfig()): void {
    if (typeof document === 'undefined') return;

    // `isConnected` as well as null: a detached element still satisfied the old
    // check, so once anything removed the sheet — a test teardown, a framework
    // hot-reload, a consumer tidying `<head>` — every later injection wrote into a
    // node no document could see, and every renderer after that point drew
    // unstyled. Found by a test's own cleanup.
    if (!styleElement || !styleElement.isConnected) {
        styleElement = document.createElement('style');
        styleElement.id = 'aparte-renderer-styles';
        document.head.appendChild(styleElement);
        // A fresh sheet holds nothing, so everything has to be re-emitted into it.
        styleElement.textContent = Array.from(injectedRendererStyles).join('\n');
    }

    let added = false;
    for (const renderer of registryFor(config).renderers.values()) {
        const css = renderer.getStyles?.();
        if (!css || injectedRendererStyles.has(css)) continue;
        injectedRendererStyles.add(css);
        added = true;
    }
    if (added) styleElement.textContent = Array.from(injectedRendererStyles).join('\n');
}


/**
 * Put a tool renderer's stylesheet on the page, once per tool name.
 *
 * It used to be an inline block in two places — the client's `tool-start` handler and
 * the stream adapter's — and nowhere on the path that RE-renders a stored conversation.
 * So a custom tool renderer was styled while its tool ran and bare after a reload: the
 * markup came back (`toolCallRenderer` looks the renderer up and delegates to it), the
 * CSS did not, because nothing replays `tool-start` for history. A consumer worked
 * around it by re-injecting the styles themselves at startup, which is the shape of a
 * library defect, not of an app's concern.
 *
 * Called from the render path as well as the two live ones, so "the renderer drew" and
 * "its rules are on the page" cannot come apart again. Keyed by tool NAME rather than by
 * the CSS text, which is what the two inline copies did and what makes it idempotent.
 */
export function injectToolRendererStyles(toolName: string, renderer: { getStyles?: () => string }): void {
    if (typeof document === 'undefined') return;
    const css = renderer.getStyles?.();
    if (!css) return;
    const id = `aparte-tool-renderer-${toolName}`;
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
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
    const reg = registryFor(config);
    reg.defaultsInstalled = true;
    // Additive, exactly like the lazy {@link installDefaultRenderersOnce}: a type
    // someone registered themselves is never replaced.
    //
    // This used to overwrite, and the two paths therefore disagreed about the same
    // question — which is the divergence this repo keeps finding. It cost a real
    // hour: the vanilla example registered a `thinking` renderer at startup and
    // then built its `AparteClient`, whose default `autoRegister` calls this
    // function, which silently put the built-in back. The registry reported the
    // custom renderer, the DOM showed the built-in's output, and nothing anywhere
    // said the order mattered.
    for (const renderer of DEFAULT_RENDERERS) {
        if (!reg.renderers.has(renderer.type)) registerSegmentRenderer(renderer, config);
    }
    injectRendererStyles(config);
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
    errorRenderer,
    toolCallRenderer,
    artifactRenderer,
    pipelineWaitingRenderer,
] as readonly AparteSegmentRenderer[];
