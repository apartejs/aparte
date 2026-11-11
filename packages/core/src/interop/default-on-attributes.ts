/**
 * The boolean attributes whose default is ON, turned off only by the string `"false"`.
 *
 * The element reads them as `getAttribute(name) !== 'false'`, so an ABSENT attribute is ON,
 * and a prop bag's `false` that removes it — what a presence attribute wants — turns the
 * control on instead. `applyElementProps` reads this list to write `"false"` there, which is
 * the path every wrapper's `AparteUi` takes. The Angular directives are generated from the
 * same knowledge (`threeStateBooleans` in `element-bindings.config.mjs`), and
 * `default-on-attributes.test.ts` keeps the two lists equal: a runtime list cannot be read from
 * the generated registry, which is built, not committed.
 *
 * Internal: not exported from the package barrel.
 */
export const APARTE_DEFAULT_ON_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
    'aparte-composer-add-attachment': ['multiple'],
    'aparte-composer': ['submit-on-enter'],
    'aparte-launcher': ['header'],
};

/** Whether `name` is ON by default on `el`, so its OFF is the string `"false"`. */
export function isDefaultOn(el: Element, name: string): boolean {
    return APARTE_DEFAULT_ON_ATTRIBUTES[el.localName]?.includes(name) === true;
}
