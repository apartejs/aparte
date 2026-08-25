/**
 * The template spelling of an attribute, and the re-export of the generated surface.
 *
 * The interfaces and the registry are NOT here any more: they are generated from
 * `dist/custom-elements.json` into `src/generated/`, which is gitignored and rewritten
 * on every build. They were written by hand for about a day, and the generator
 * reproduced all 15 interfaces and all 48 properties exactly — plus one attribute I had
 * missed. Copying a machine-readable source by hand buys nothing and drifts.
 *
 * What stays here is the part no manifest can carry: how a TEMPLATE must spell an
 * attribute, which is a fact about React, Vue and Svelte rather than about the element.
 */
export type * from '../generated/element-attributes.js';

/**
 * One attribute as a TEMPLATE must write it.
 *
 * A presence attribute becomes `'' | undefined`, never `boolean`, and that is not
 * pedantry — it is the same trap in all three template languages. React, Vue and Svelte
 * all stringify what they set on a custom element, so `disabled={false}` renders
 * `disabled="false"`, and an element that tests `hasAttribute` reads that as ON. The
 * wrapper's own bubble rendering already used the right spelling
 * (`streaming={… ? '' : undefined}`); this makes it the only one that type-checks.
 *
 * `null` is in the union alongside `undefined` because all three treat it as REMOVE,
 * and Vue's own wrapper template writes exactly that (`:streaming="… ? '' : null"`).
 * Leaving it out made the wrapper's own code fail to type-check — the second time the
 * existing wrappers corrected a declaration here, after `timestamp`, which the React
 * bubble rendering proved accepts a number.
 *
 * A numeric attribute takes a number or the string it becomes, because both read
 * naturally in a template.
 *
 * Angular does NOT use this: its directives take `boolean` through `booleanAttribute`
 * and write the attribute themselves, so a consumer there writes `[disabled]="busy"`.
 * That difference is the whole reason this is a mapping and not the declared type.
 */
export type AparteAttrValue<T> = T extends boolean ? '' | null | undefined
    : T extends number ? number | string
    : T;

/** An element's attribute surface, in template spelling. Used by three of four wrappers. */
export type AparteTemplateAttrs<T> = { [K in keyof T]?: AparteAttrValue<NonNullable<T[K]>> };
