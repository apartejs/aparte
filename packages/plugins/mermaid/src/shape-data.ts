/**
 * What a diagram's source can make the page fetch while Mermaid draws it.
 *
 * Mermaid draws into the live page, measuring the diagram there, and only then does the plugin
 * turn the SVG into the sandboxed image it shows. Anything the browser fetches while the SVG is
 * in the page is a request the reader never asked for, carrying whatever the model put in the
 * address. `securityLevel: 'strict'` does not cover these. Three sources are closed here:
 *
 *  1. A node picture: `A@{ img: "https://…" }`, and a sequence actor's `properties` /
 *     `details` icon. Read from what Mermaid PARSED (`parsedFetchesImage`), not from the text:
 *     the shape-data block is YAML, and anchors, aliases, explicit keys, comments and escapes
 *     let a source spell the key without the three letters in a row (an anchor on an `img` key
 *     in one mapping, reused as an alias in another). Asking the parser what it understood
 *     closes the whole class. `fetchesImage` is the same rule on the text, for a Mermaid
 *     object that cannot be asked, and it over-refuses on purpose.
 *  2. A CSS image in a style a diagram writes: a `classDef` (state, block, class diagrams), a
 *     `style`, an `%%{init}%%` theme variable. The sheet is inserted in the page while the
 *     diagram is measured, and `mask-image:url(…)` is fetched there. `cssFetches` refuses
 *     the CSS functions that name a picture, and any escape that could spell one, in a source
 *     that styles anything.
 *
 * Pure — no DOM, no Mermaid — so it is checked in Node.
 */

/* ------------------------------------------------------------------ parsed ----- */

/** A diagram as `mermaid.mermaidAPI.getDiagramFromText` returns it: parsed, not drawn. */
export interface ParsedDiagram {
    db?: unknown;
}

const INLINE_PICTURE = /^\s*data:image\//i;

/** A picture field is fine when it holds nothing, or an inline picture. */
const quiet = (value: unknown): boolean =>
    value === undefined || value === null || value === '' || (typeof value === 'string' && INLINE_PICTURE.test(value));

function entries(collection: unknown): unknown[] {
    if (collection instanceof Map) return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    if (collection && typeof collection === 'object') return Object.values(collection);
    return [];
}

function ask(db: Record<string, unknown>, name: string): unknown {
    const method = db[name];
    return typeof method === 'function' ? (method as () => unknown).call(db) : undefined;
}

/**
 * Whether a parsed diagram holds a picture that is not inline: a flowchart vertex's `img`, or
 * a sequence actor's `properties.icon` — however the source spelled it, and wherever it came
 * from (`properties`, `details` reading the page, shape data through a YAML alias).
 */
export function parsedFetchesImage(diagram: ParsedDiagram | null | undefined): boolean {
    const db = diagram?.db;
    if (!db || typeof db !== 'object') return false;
    const reader = db as Record<string, unknown>;
    for (const vertex of entries(ask(reader, 'getVertices'))) {
        if (!quiet((vertex as { img?: unknown } | null)?.img)) return true;
    }
    for (const actor of entries(ask(reader, 'getActors'))) {
        if (!quiet((actor as { properties?: { icon?: unknown } } | null)?.properties?.icon)) return true;
    }
    return false;
}

/* -------------------------------------------------------------------- text ----- */

/** `img`, bare or quoted, then its colon and a value that starts as an inline picture. */
const INLINE_IMG_ENTRY = /img["']?[ \t]*:[ \t]*["']?data:image\//iy;
/** `img` anywhere, any case. */
const IMG = /img/gi;
/** What continues a word on its left: base64 is made of these, and no YAML key starts after one. */
const WORD_BEFORE = /[A-Za-z0-9+/=_-]/;
/** What continues a word on its right (`imgur`): the key would not be `img`. */
const WORD_AFTER = /[A-Za-z0-9_]/;
/**
 * A YAML escape that can spell `img` (`"img"`) or a value's scheme without writing it, and an
 * escaped line break, which a double-quoted scalar joins without a space (`"im\⏎g"`). Mermaid
 * turns CRLF and a lone CR into LF before it lexes, so every kind of break counts.
 */
const SPELLED_ESCAPE = /\\(?:[xuU]|[\r\n\u0085\u2028\u2029])/;
/** YAML anchors and aliases: one mapping's `&k img` can be reused as the key `*k` in another. */
const ANCHOR_OR_ALIAS = /[&*][^\s,;:\]})&*]/;
/** A sequence diagram, and the two statements that give an actor an icon. */
const SEQUENCE = /\bsequenceDiagram\b/i;
const ACTOR_ICON = /\b(?:properties|details)\b/i;

/**
 * The text-only version of the shape-data rule, for a Mermaid object that cannot say what it
 * parsed. It does not try to find blocks, so it cannot be put out of step by a source written
 * for the purpose: when the source holds `@{` at all, every `img`, in any case, must be an entry
 * whose value is an inline picture, and no escape, anchor or alias may be present. A label that
 * says "img" as a word in such a diagram is refused too, and so is a sequence diagram that uses
 * the word `properties` or `details`: that is the price of not parsing.
 *
 * Nothing is skipped "to the end of a value": a quote that opens in a comment, a label or a
 * plain scalar closes nowhere this file can tell. An `img` is skipped only when it sits inside
 * a longer word (a base64 picture, `src/img/`, `imgur`), because no YAML key can start there.
 */
export function fetchesImage(source: string): boolean {
    if (SEQUENCE.test(source) && ACTOR_ICON.test(source)) return true;
    if (!source.includes('@{')) return false;
    const text = source.replace(/\r\n?/g, '\n');
    if (SPELLED_ESCAPE.test(text) || ANCHOR_OR_ALIAS.test(text)) return true;
    IMG.lastIndex = 0;
    for (let found = IMG.exec(text); found; found = IMG.exec(text)) {
        const before = text[found.index - 1];
        const after = text[found.index + 3];
        if ((before && WORD_BEFORE.test(before)) || (after && WORD_AFTER.test(after))) continue;
        INLINE_IMG_ENTRY.lastIndex = found.index;
        if (!INLINE_IMG_ENTRY.test(text)) return true;
    }
    return false;
}

/* --------------------------------------------------------------------- css ----- */

/**
 * The CSS functions that load a picture in Chromium, Firefox and Safari (`image()` and
 * `element()` are not drawn by a browser that ships them today). Preceded by a letter or a
 * digit it is another name (`getURL(`), so only a word start counts.
 */
const CSS_IMAGE_FUNCTION = /(?<![A-Za-z0-9_-])(?:-(?:webkit|moz)-)?(?:url|image-set|cross-fade)\(/i;
const CSS_IMPORT = /@import\b/i;
/** The statements and settings a diagram styles itself with, in any diagram type. */
const STYLING = /\b(?:classDef|style|linkStyle|cssClass|themeCSS|themeVariables|init)\b|%%\{/i;
/**
 * An escape CSS (`\75 rl(`, `u\rl(`: a backslash before ANY character stands for that character) or a JSON
 * string (`\u0075rl(`) decodes into the name of a function. Any backslash, not a list of the letters
 * that begin an escape.
 */
const NAME_ESCAPE = /\\/;

/**
 * Whether a source carries a CSS picture into the page's stylesheet. A `classDef` rest-of-line,
 * a `style`, or an `%%{init}%%` theme variable lands in the `<style>` of the SVG, and Mermaid
 * puts that SVG in the page to measure it, where `mask-image:url(…)` is fetched at once.
 * No `@{` is needed, and a list of properties would never be complete (`mask-image`,
 * `border-image`, `background`, `list-style`, `cursor`…), so the rule is on the functions
 * that name a picture, wherever they stand, and on any backslash that could spell one in a
 * source that styles anything. A Windows path in a diagram that also has a `style` is refused too.
 */
export function cssFetches(source: string): boolean {
    if (CSS_IMAGE_FUNCTION.test(source) || CSS_IMPORT.test(source)) return true;
    return STYLING.test(source) && NAME_ESCAPE.test(source);
}
