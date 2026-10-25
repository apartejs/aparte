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
import { notifyConfigChange } from '../config/aparte-config.js';
// The built-in renderers, one file each under ./segments/ — `DEFAULT_RENDERERS` at
// the bottom is the list, and the count (this line used to say "nine" over a list
// of seven, then six: the artifact card left for `@aparte/plugin-artifacts`, which
// registers it through the same public `registerSegmentRenderer`). This module is
// the REGISTRY: it owns which renderer draws which segment type, per config, and
// the style injection they share. It knows nothing about how any of them render.
import { textRenderer } from './segments/text.js';
import { thinkingRenderer } from './segments/thinking.js';
import { codeRenderer } from './segments/code.js';
import { errorRenderer } from './segments/error.js';
import { toolCallRenderer } from './segments/tool-call.js';

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
 * chats on one page", so two chats can render the same segment type differently.
 *
 * A WeakMap rather than fields on `AparteConfig`: that class is already the
 * largest thing in the package. Keying the state here keeps it next to the code that
 * reads it, and it is collected with the config it belongs to.
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
 * `config` prop would otherwise resolve its own registry and find nothing there: the
 * renderer registered the documented way would be invisible to every chat that uses
 * the feature the `config` prop exists for.
 *
 * A config that DECLINED the built-ins inherits nothing — it said it brings its
 * own everything, and quietly handing it the global's renderers would turn
 * `autoRegister: false` into a no-op.
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
    const reg = registryFor(config);
    if (reg.renderers.get(renderer.type) === renderer) return;
    reg.renderers.set(renderer.type, renderer as AparteSegmentRenderer);
    injectRendererStyles(config);
    // Segments of this type already on screen are drawn again by it (the renderer that
    // drew them gets its `cleanup`); nothing else is touched.
    notifyConfigChange(config);
}

/** {@link overrideSegmentRenderer}'s stacks, per config and type: what each held below every override. */
const overrideStacks = new WeakMap<AparteConfig, Map<string, Array<AparteSegmentRenderer | undefined>>>();

/**
 * Put `renderer` over whatever draws its `type`, and get back the function that takes it off
 * again — the registration a component makes for as long as it is mounted.
 *
 * Overrides stack per type. The function restores what was there before THIS override;
 * taking off one that is no longer on top changes nothing on screen, so of two components
 * declaring the same type the newer wins and unmounting the older keeps it. When the last
 * one goes, the type is drawn by what drew it before the first — another registration, or
 * core's own renderer for a built-in type like `code` or `text`. Segments on screen follow
 * each change. The returned function is safe to call twice.
 */
export function overrideSegmentRenderer<T extends AparteSegmentBase>(
    renderer: AparteSegmentRenderer<T>,
    config: AparteConfig = contextConfig(),
): () => void {
    const type = renderer.type;
    const reg = registryFor(config);
    let byType = overrideStacks.get(config);
    if (!byType) { byType = new Map(); overrideStacks.set(config, byType); }
    let stack = byType.get(type);
    if (!stack) { stack = [reg.renderers.get(type)]; byType.set(type, stack); }
    stack.push(renderer as AparteSegmentRenderer);
    registerSegmentRenderer(renderer, config);
    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        const i = stack.lastIndexOf(renderer as AparteSegmentRenderer);
        if (i > 0) stack.splice(i, 1);
        if (stack.length === 1) byType.delete(type);
        // Below every override there may be nothing registered for a built-in type: the
        // built-ins are filled in lazily, once, and the sweep skipped the type an override
        // held. Restoring "nothing" would leave the type with no renderer at all.
        const top = stack[stack.length - 1]
            ?? (reg.defaultsDeclined ? undefined : DEFAULT_RENDERERS.find((r) => r.type === type));
        if (top) registerSegmentRenderer(top, config);
        else unregisterSegmentRenderer(type, config);
    };
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
 * Why lazily and not at import time: `registerDefaultRenderers()` is called by
 * `new AparteClient()`, and an app on the bring-your-own-loop path — the one the guide
 * tells you not to construct a client on — never makes that call. Without this sweep
 * it would render `[Unknown segment type: text]` for every reply, with bubbles,
 * streaming and scrolling all working, which reads as a bug in the consumer's own
 * loop rather than as a missing call.
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
}

/**
 * Unregister a segment renderer. Segments of this type on screen are drawn again by what
 * resolves now (the global registration, for an instance config), or left unrendered.
 */
export function unregisterSegmentRenderer(type: string, config: AparteConfig = contextConfig()): void {
    const reg = registryFor(config);
    if (!reg.renderers.has(type)) return;
    reg.renderers.delete(type);
    notifyConfigChange(config);
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
 * The styles collected are the given config's, not `contextConfig()`'s: at app startup
 * there is no ambient render config, which means the global singleton's, and a renderer
 * registered on an instance config would have the GLOBAL's stylesheet emitted over it
 * and draw unstyled.
 *
 * Accumulating (rather than assigning the latest config's sheet) is the other half:
 * one `<style>` serves the whole document, so the second config to register must
 * not erase the first one's rules. Deduped per renderer stylesheet, so the
 * built-ins shared by every config are emitted once.
 */
const injectedRendererStyles = new Set<string>();

export function injectRendererStyles(config: AparteConfig = contextConfig()): void {
    if (typeof document === 'undefined') return;

    // `isConnected` as well as null: a detached element passes a null check, so once
    // anything removes the sheet — a test teardown, a framework hot-reload, a consumer
    // tidying `<head>` — every later injection would write into a node no document can
    // see, and every renderer after that point would draw unstyled.
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


/** The `<style>` id each renderer's sheet went in under, by renderer. */
const toolRendererSheetIds = new WeakMap<object, string>();

/**
 * Put a tool renderer's stylesheet on the page, once per RENDERER.
 *
 * Called from the stream adapter's `tool-start` handler and from `toolCallRenderer` on
 * every render, a stored conversation's included (it looks the renderer up and delegates
 * to it; nothing replays `tool-start` for history), so "the renderer drew"
 * and "its rules are on the page" cannot come apart.
 *
 * Keyed by the renderer, named after the first tool it drew: the name was the renderer's
 * identity while one renderer drew one tool, and a renderer registered for a pattern or
 * `'*'` draws many, which put a copy of the same rules on the page per tool.
 */
export function injectToolRendererStyles(toolName: string, renderer: { getStyles?: () => string }): void {
    if (typeof document === 'undefined') return;
    const css = renderer.getStyles?.();
    if (!css) return;
    let id = toolRendererSheetIds.get(renderer);
    if (!id) {
        id = `aparte-tool-renderer-${toolName}`;
        toolRendererSheetIds.set(renderer, id);
    }
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
}

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
}

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
] as readonly AparteSegmentRenderer[];
