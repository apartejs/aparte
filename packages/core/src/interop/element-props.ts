/**
 * Vanilla-DOM helpers shared by the framework wrappers' `AparteUi` pass-through
 * component. They live in core (zero-dep) so the four wrappers don't each carry
 * a byte-identical copy — only the framework-specific mounting differs.
 */

/** The custom events aparté elements actually dispatch (verified against core). */
export const DEFAULT_UI_EVENTS: readonly string[] = [
    'aparte-send',
    'aparte:action',
    'aparte:retry',
    'aparte:edit',
    'aparte:branch-navigate',
    'aparte:composer-change',
    'aparte:path-changed',
];

/**
 * Apply props to an aparté custom element. aparté elements are
 * **attribute-driven** (`observedAttributes`): assigning a property is either a
 * silent no-op (nothing observes it) or throws outright on a getter-only
 * accessor — `<aparte-composer>`'s `placeholder`/`disabled` are exactly that.
 * So primitives go through `setAttribute`; only values an attribute cannot carry
 * (objects, functions) are handed over as properties. Keys starting with `--`
 * become CSS variables; `on…` function values are ignored (event forwarding is
 * the wrapper's job).
 *
 * `transformValue` is applied to object/function values before they're set as
 * properties — Vue passes `toRaw` to unwrap its reactive proxy (a deep proxy
 * breaks Maps/class internals on a plain custom element); it defaults to identity.
 */
export function applyElementProps(
    el: HTMLElement,
    props: Record<string, unknown>,
    transformValue: (value: unknown) => unknown = (value) => value,
): void {
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('--')) {
            el.style.setProperty(key, String(value));
        } else if (key.startsWith('on') && typeof value === 'function') {
            // Event handlers belong on the wrapper's event forwarding, not here.
        } else if (value === null || value === undefined || value === false) {
            el.removeAttribute(key);
        } else if (value === true) {
            el.setAttribute(key, '');
        } else if (typeof value === 'object' || typeof value === 'function') {
            (el as unknown as Record<string, unknown>)[key] = transformValue(value);
        } else {
            el.setAttribute(key, String(value));
        }
    }
}
