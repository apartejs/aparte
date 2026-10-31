/**
 * The few DOM helpers every card draws with.
 *
 * A card shows what a tool returned, and a tool's result is untrusted: every value goes
 * in through `textContent` or an attribute, never through `innerHTML`. The one markup a
 * card parses is its own glyphs, which are constants of this package.
 */

type Child = Node | string | null | undefined | false;

/** An element with classes, attributes and children; text children become text nodes. */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: { class?: string; attrs?: Record<string, string | number | boolean | null | undefined>; text?: string } = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (props.class) node.className = props.class;
    for (const [name, value] of Object.entries(props.attrs ?? {})) {
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(name, value === true ? '' : String(value));
    }
    if (props.text !== undefined) node.textContent = props.text;
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
    }
    return node;
}

/** One of this package's own SVG glyphs, as an element. Never call it with outside markup. */
export function glyph(markup: string, className = 'aparte-rich-card__glyph'): HTMLElement {
    const holder = document.createElement('span');
    holder.className = className;
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = markup;
    return holder;
}

/**
 * A link a card may open: `http(s)`, `mailto` and `tel` only, resolved against the page.
 * Anything else — `javascript:`, `data:`, a typo — is no link, so the action is not drawn.
 */
export function safeUrl(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
        const url = new URL(raw.trim(), typeof location === 'undefined' ? 'https://localhost/' : location.href);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

/**
 * A web address (`http`/`https`) — for an image or a page, where `mailto:` and `tel:` make no
 * sense. Absolute only: it comes from a tool's result, and a relative one (`lille.png`,
 * `/api/logout`) would become a request to the app's own origin, with its cookies, on render.
 */
export function webUrl(raw: unknown): string | null {
    if (typeof raw !== 'string' || !/^\s*(https?:)?\/\//i.test(raw)) return null;
    const url = safeUrl(raw);
    return url && /^https?:/i.test(url) ? url : null;
}

/**
 * A tool's JSON, read key by key through the vendors' shapes (`r['geometry']?.['location']`).
 * Loose on purpose: no value read from it is used before a reader (`num`, `str`, `webUrl`,
 * `toDate`…) has checked it, so typing every level would add casts and no safety. Not exported
 * from the package.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = Record<string, any>;

/** A finite number, or `undefined` — a tool's "N/A", `null` or `"12"` handled once. */
export function num(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

/** A non-empty trimmed string, or `undefined`. */
export function str(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
}
