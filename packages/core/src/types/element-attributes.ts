/**
 * The template spelling of an attribute, and the re-export of the generated surface.
 *
 * The interfaces and the registry are generated from `dist/custom-elements.json` into
 * `src/generated/`, which is gitignored and rewritten on every build.
 *
 * What stays here is the part no manifest can carry: how a TEMPLATE must spell an
 * attribute, which is a fact about React, Vue and Svelte rather than about the element.
 */
export type * from '../generated/element-attributes.js';

/**
 * One attribute as a TEMPLATE must write it.
 *
 * A presence attribute becomes `'' | undefined`, never `boolean`, and that is not
 * pedantry — it is the same trap in all three template languages. React and Vue
 * stringify what they set on a custom element, so `disabled={false}` renders
 * `disabled="false"`, and an element that tests `hasAttribute` reads that as ON. The
 * right spelling is `streaming={… ? '' : undefined}`; this type makes it the only one
 * that type-checks.
 *
 * Svelte 5 shapes the SETTERS: it assigns the PROPERTY
 * whenever the element has a setter for it (`set_custom_element_data` checks
 * `get_setters(node)`), so an accessor-backed presence attribute receives the `''`
 * this union promises as a property value. Every presence setter therefore treats
 * `''` as ON (`presenceOn` in utils/presence.ts) — one spelling, both paths.
 *
 * `null` is in the union alongside `undefined` because all three treat it as REMOVE,
 * and Vue templates write exactly that (`:streaming="… ? '' : null"`).
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
