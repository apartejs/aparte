/**
 * What a presence-attribute SETTER makes of what it was handed.
 *
 * The generated attribute types map a presence attribute to `'' | null | undefined`,
 * because React and Vue stringify what they set on a custom element — so `''` is the
 * documented spelling for ON. Svelte 5 does not take the attribute path: it assigns
 * the PROPERTY whenever the element has one, which hands these setters the `''` the
 * types promise — and `toggleAttribute(name, '')` reads an empty string as falsy, so
 * the attribute would be REMOVED, the opposite of what the template asked for.
 *
 * One rule serves both paths without forking the spelling: on a presence property, an
 * empty string means ON, exactly as an empty attribute does. Everything else keeps
 * JavaScript's own truthiness (`false`, `null`, `undefined` → OFF).
 */
export function presenceOn(value: unknown): boolean {
    return value === '' ? true : Boolean(value);
}
