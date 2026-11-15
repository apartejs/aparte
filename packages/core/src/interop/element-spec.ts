/**
 * An element described for a framework: what it takes as attributes, what only as properties, the
 * events it sends and the name each binds under. Data, and the types that go with it.
 *
 * Core's own elements have generated components and directives in each wrapper. An element a
 * plugin defines — ours or a third party's — cannot be in a wrapper (a wrapper depends on no
 * plugin, and a third party could never add a line there), and a plugin cannot import a wrapper.
 * So the description lives here, where both can reach it: the plugin exports one, and each
 * wrapper turns it into what its framework needs — a component in React, a `GlobalComponents`
 * entry in Vue, a `SvelteHTMLElements` entry in Svelte.
 *
 * The types ride on the value as phantom generics, so `typeof approvalModeElement` carries the
 * attribute, property and event types to a wrapper with no runtime cost: `'~types'` is never set.
 */

/** One event of a spec, as a type: the name it binds under, and the detail it carries (`null` for none). */
export interface AparteElementSpecEvent<Name extends string = string, Detail = unknown> {
    readonly name: Name;
    readonly detail: Detail;
}

/** The events of a spec, as a type, by DOM event name. */
export type AparteElementSpecEvents = { readonly [type: string]: AparteElementSpecEvent };

/**
 * An element described for a framework wrapper.
 *
 * - `tag`: the element's tag.
 * - `attributes`: what it takes as an attribute, written when its value changes.
 * - `properties`: what it has only as a property (an array, a function), assigned.
 * - `events`: `[DOM event, binding name]` — the binding name is neutral (`approvalModeChange`); a
 *   wrapper spells it its own way (`onApprovalModeChange` in React).
 * - `initial`: attributes the element reads once, when it connects: rendered with it.
 *
 * `Attrs`, `Props` and `Events` type them; `Events` maps each DOM event to its binding name and
 * detail. A plugin generates its spec from its manifest; a spec of your own is one literal:
 *
 * @example
 * ```ts
 * import type { AparteElementSpec } from '@aparte/core';
 *
 * export const myWidgetElement: AparteElementSpec<
 *     { label?: string; compact?: boolean },
 *     { items?: string[] },
 *     { 'my-widget-pick': { name: 'pick'; detail: { value: string } } }
 * > = {
 *     tag: 'my-widget',
 *     attributes: ['label', 'compact'],
 *     properties: ['items'],
 *     events: [['my-widget-pick', 'pick']],
 *     initial: [],
 * };
 * ```
 */
export interface AparteElementSpec<
    Attrs extends object = object,
    Props extends object = object,
    Events extends AparteElementSpecEvents = AparteElementSpecEvents,
> {
    readonly tag: string;
    readonly attributes: readonly string[];
    readonly properties: readonly string[];
    readonly events: readonly (readonly [type: string, name: string])[];
    readonly initial: readonly string[];
    /** Types only, never set: what `Attrs`, `Props` and `Events` say, for a wrapper to read off `typeof spec`. */
    readonly '~types'?: { readonly attributes: Attrs; readonly properties: Props; readonly events: Events };
}

/** The attributes a spec types. */
export type AparteSpecAttributes<S> = S extends { readonly '~types'?: { readonly attributes: infer A } } ? A : never;
/** The properties a spec types. */
export type AparteSpecProperties<S> = S extends { readonly '~types'?: { readonly properties: infer P } } ? P : never;
/** The events a spec types, by DOM event name: `{ name, detail }` each. */
export type AparteSpecEvents<S> = S extends { readonly '~types'?: { readonly events: infer E } } ? E : never;
