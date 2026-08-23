/**
 * Per-instance config resolution (Phase 2, step 1 — the seam only).
 *
 * `aparteGlobalConfig` is a page-wide singleton: one config for the whole page. That makes
 * two independent chats on one page impossible (changing the model of one
 * changes the other) and couples every component to global state.
 *
 * This module adds an OPTIONAL instance boundary without touching behaviour:
 * a host element can carry its own {@link AparteConfig} instance, and any
 * component resolves "its" config by walking up to the nearest such host —
 * falling back to the global singleton when there is none. Until a caller
 * attaches an instance config, `resolveConfig` always returns the global, so
 * single-chat apps are unaffected.
 *
 * Step 2 migrates the ~23 component read-sites from `aparteGlobalConfig.x()` to
 * `resolveConfig(this).x()`. This step just ships the mechanism + tests.
 */

import { aparteGlobalConfig, AparteConfig } from './aparte-config.js';

/** Marks an element as an instance-config boundary (used by `closest()`). */
export const APARTE_HOST_ATTR = 'data-aparte-host';

/** Non-enumerable slot holding the instance config on a boundary element. */
const CONFIG_SLOT = Symbol.for('aparte.instanceConfig');

interface ConfigHost {
    [CONFIG_SLOT]?: AparteConfig;
}

/**
 * Implemented by an element that REGISTERS something on its config rather than
 * only reading from it — an elicitation presenter, a renderer, a listener keyed
 * on the config object.
 *
 * Reading is safe without this hook: `resolveConfig(this)` at every use site
 * always sees the current boundary. WRITING is not. A write happens once, into
 * whichever config was resolvable at that moment — and under all four wrappers
 * that moment is *before* the boundary exists, because `AparteChatHost.bind()`
 * runs from a post-mount hook. So the write lands on the global singleton and
 * the instance config never gets it.
 *
 * That is not hypothetical: `<aparte-elicitation>` registered its presenter at
 * connect, so under every wrapper `requestUserInput()` found no presenter on the
 * instance config and answered the model `cancel` — the model was told the user
 * refused while the user was shown nothing at all.
 *
 * Implement this and re-do the registration: move it off `previous`, put it on
 * `next`. Both {@link attachConfig} and {@link detachConfig} call it, so the same
 * method handles teardown, which is where the mirror-image leak lived.
 */
export interface AparteConfigAware {
    aparteConfigChanged(next: AparteConfig, previous: AparteConfig): void;
}

/**
 * Tell everything already inside `root` that its resolution just changed.
 *
 * A depth-first sweep rather than an event: an event dispatched on the boundary
 * does not reach descendants (events bubble up, not down), and one dispatched on
 * every descendant would be the same sweep with more ceremony. `root` itself is
 * included — a boundary element may also be a registrant.
 */
function notifyConfigChanged(root: HTMLElement, next: AparteConfig, previous: AparteConfig): void {
    if (next === previous) return;
    const call = (el: HTMLElement): void => {
        const hook = (el as Partial<AparteConfigAware>).aparteConfigChanged;
        if (typeof hook === 'function') hook.call(el, next, previous);
    };
    call(root);
    for (const el of root.querySelectorAll<HTMLElement>('*')) call(el);
}

/**
 * Attach an instance config to `el`, making it a resolution boundary: every
 * component inside `el` resolves to `config` instead of the global singleton.
 * Idempotent; pass the same element to replace its config.
 *
 * Anything already mounted inside `el` that implements {@link AparteConfigAware}
 * is told, because attaching a boundary silently rewrites what those children
 * resolve to and a registration they already made is now on the wrong object.
 */
export function attachConfig(el: HTMLElement, config: AparteConfig): void {
    const previous = (el as unknown as ConfigHost)[CONFIG_SLOT] ?? resolveConfig(el.parentElement);
    (el as unknown as ConfigHost)[CONFIG_SLOT] = config;
    el.setAttribute(APARTE_HOST_ATTR, '');
    notifyConfigChanged(el, config, previous);
}

/**
 * Remove the instance-config boundary from `el` (e.g. in `disconnectedCallback`).
 * Components under `el` fall back to the next boundary up, or the global.
 *
 * Registrants are told BEFORE they would silently re-resolve elsewhere, which is
 * the half that leaked: a wrapper's `unbind()` detaches the boundary before the
 * framework removes the DOM, so by the time `disconnectedCallback` ran, the
 * element's own `resolveConfig(this)` already returned the global — its
 * "am I still the registered one?" guard compared against the wrong config, found
 * no match, and left the instance config holding a removed element for good.
 */
export function detachConfig(el: HTMLElement): void {
    const previous = (el as unknown as ConfigHost)[CONFIG_SLOT];
    delete (el as unknown as ConfigHost)[CONFIG_SLOT];
    el.removeAttribute(APARTE_HOST_ATTR);
    if (previous) notifyConfigChanged(el, resolveConfig(el.parentElement), previous);
}

/**
 * Resolve the config governing `el`: the nearest ancestor boundary's instance
 * config (including `el` itself), or {@link aparteGlobalConfig} when none is
 * present. Cheap — a single `closest()`.
 *
 * DO NOT cache this at `connectedCallback`. An earlier version of this comment
 * advised exactly that, and two elements followed it into a real bug: a framework
 * wrapper calls `AparteChatHost.bind()` — which is what runs `attachConfig` — from
 * its POST-mount hook (React `useEffect`, Vue `onMounted`, Svelte `onMount`,
 * Angular `ngAfterViewInit`), so children mounted in the same commit connect
 * BEFORE the boundary exists. A connect-time cache therefore freezes the global
 * config forever, and the `config` prop every wrapper advertises silently does
 * nothing for that element.
 *
 * Resolve it live, in a getter. `closest()` on a shallow tree is not a cost worth
 * a correctness bug — `aparte-chat-bubble` has done it that way from the start, and
 * it is the one element that was never affected.
 *
 * That advice covers READERS, and it is not enough on its own. An element that
 * WRITES to its config — registering a presenter, a renderer, a keyed listener —
 * cannot fix the ordering by resolving live, because the write already happened.
 * Those implement {@link AparteConfigAware} and re-register when told. The
 * reader/writer distinction is the one this file missed the first time round: the
 * sweep that applied the advice above fixed every reader and left both writers
 * broken.
 */
export function resolveConfig(el: Element | null | undefined): AparteConfig {
    const host = el?.closest?.(`[${APARTE_HOST_ATTR}]`) as (Element & ConfigHost) | null | undefined;
    return host?.[CONFIG_SLOT] ?? aparteGlobalConfig;
}

// ─── Render context ──────────────────────────────────────────────────────────
// Segment/tool renderers are plain functions — `render(segment)` receives no
// element to resolve from. Instead, the component invoking them (e.g. the
// bubble) wraps the call in `runWithConfig(resolveConfig(this), …)`, and the
// renderer reads `contextConfig()`. Synchronous only: async continuations must
// capture the config BEFORE awaiting (`const cfg = contextConfig()` at the top).

let _renderConfig: AparteConfig | null = null;

/** Run `fn` with `config` as the ambient render config (restored after). */
export function runWithConfig<T>(config: AparteConfig, fn: () => T): T {
    const prev = _renderConfig;
    _renderConfig = config;
    try {
        return fn();
    } finally {
        _renderConfig = prev;
    }
}

/**
 * The ambient render config set by {@link runWithConfig}, else the config
 * resolved from `el` (when provided), else the global singleton. Capture it
 * synchronously at the top of a renderer — never after an `await`.
 */
export function contextConfig(el?: Element | null): AparteConfig {
    return _renderConfig ?? resolveConfig(el);
}
