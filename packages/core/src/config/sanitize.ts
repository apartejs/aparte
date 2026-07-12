/**
 * Zero-dependency HTML sanitizer for provider output.
 *
 * Aparte renders LLM-authored content: a markdown or highlight provider turns the
 * assistant's text into HTML that is then injected via `innerHTML`. Prompt
 * injection can make a model emit arbitrary markup (`<img onerror=…>`,
 * `<script>`, `javascript:` URLs), so that HTML is **untrusted** and must be
 * scrubbed before it touches the DOM.
 *
 * This is an allowlist sanitizer built on the browser's own parser: the HTML is
 * parsed into an inert document (scripts never execute during
 * `DOMParser.parseFromString`), the tree is rebuilt keeping only known-safe tags
 * and attributes, then re-serialized. It is deliberately conservative and covers
 * the realistic threat model (LLM-emitted markup). For hardened, audited
 * coverage, register DOMPurify via `AparteConfig.setHtmlSanitizer`.
 */

export type AparteSanitizer = (html: string) => string;

/** Tags dropped wholesale — content and all (never unwrapped to text). */
const DANGEROUS_TAGS = new Set([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
    'applet', 'form', 'button', 'textarea', 'select', 'option', 'optgroup',
    'link', 'meta', 'base', 'title', 'head', 'html', 'body', 'template',
    'noscript', 'svg', 'math', 'portal',
]);

/** Tags kept as-is (with attributes filtered). Anything else is unwrapped to its children. */
const ALLOWED_TAGS = new Set([
    'a', 'p', 'br', 'hr', 'div', 'span', 'pre', 'code', 'kbd', 'samp', 'var',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'blockquote', 'q', 'cite',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption', 'picture', 'source',
    'input', // GFM task-list checkboxes only (attributes locked down below)
    'abbr', 'details', 'summary', 'time', 'wbr', 'address',
]);

/** Attributes allowed on any element. */
const GLOBAL_ATTRS = new Set([
    'class', 'style', 'title', 'dir', 'lang', 'id', 'role', 'align',
    'aria-label', 'aria-hidden', 'aria-describedby', 'aria-level',
]);

/** Extra attributes allowed on specific tags. */
const TAG_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'target', 'rel', 'name']),
    img: new Set(['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes', 'decoding']),
    source: new Set(['src', 'srcset', 'type', 'media', 'sizes']),
    input: new Set(['type', 'checked', 'disabled']),
    td: new Set(['colspan', 'rowspan', 'headers']),
    th: new Set(['colspan', 'rowspan', 'scope', 'headers']),
    col: new Set(['span', 'width']),
    colgroup: new Set(['span']),
    ol: new Set(['start', 'type', 'reversed']),
    time: new Set(['datetime']),
    details: new Set(['open']),
};

/** URL-bearing attributes whose scheme must be validated. */
const URL_ATTRS = new Set(['href', 'src']);
/** Schemes allowed in href/src. */
const SAFE_URL = /^(?:https?:|mailto:|tel:|ftp:|sms:)/i;
/** In-page / relative references (no explicit scheme). */
const RELATIVE_URL = /^(?:[#/.?]|[a-z0-9._~%+-]+(?:[/?#]|$))/i;
/** data: URLs are only honoured for images, and only for image media types. */
const SAFE_DATA_IMG = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|svg\+xml)?[;,]/i;
/** Whitespace + C0 control chars, used to obfuscate a scheme (e.g. " javascript:" or "java\tscript:"). */
// eslint-disable-next-line no-control-regex -- stripping C0 control chars is intentional (anti-obfuscation)
const CONTROL_WS = /[\u0000-\u0020]+/g;

/**
 * True when a URL is safe to place in a `href`/`src` attribute. Exported so a
 * streaming renderer (which bypasses the one-shot `sanitizeHtml`) can apply the
 * same URL policy live. `tag` is the host element ('a', 'img', …) — `data:image`
 * URLs are only allowed on `img`.
 */
export function isSafeUrl(value: string, tag: string): boolean {
    const v = value.replace(CONTROL_WS, '');
    if (!v) return true; // empty href/src is harmless
    if (SAFE_URL.test(v)) return true;
    if (tag === 'img' && SAFE_DATA_IMG.test(v)) return true;
    // Any other explicit scheme (javascript:, vbscript:, data: on non-img, …) is rejected.
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
    return RELATIVE_URL.test(v);
}

/** Drop inline styles that carry legacy script vectors; keep everything else (highlighters rely on style). */
function scrubStyle(value: string): string | null {
    if (/(?:expression\s*\(|javascript:|vbscript:|url\s*\(\s*['"]?\s*(?:javascript|data|vbscript):|<\/?)/i.test(value)) {
        return null;
    }
    return value;
}

function copyAttributes(src: Element, dest: Element, tag: string): void {
    const extra = TAG_ATTRS[tag];
    for (const attr of Array.from(src.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        // Event handlers and form-action overrides are never allowed.
        if (name.startsWith('on') || name.startsWith('formaction')) continue;
        // data-* attributes are inert (no execution path) and widely emitted by
        // markdown/highlight tooling — allowed, matching DOMPurify's default.
        if (!name.startsWith('data-') && !GLOBAL_ATTRS.has(name) && !(extra && extra.has(name))) continue;
        if (URL_ATTRS.has(name) && !isSafeUrl(value, tag)) continue;
        if (name === 'srcset' && /javascript:|vbscript:/i.test(value)) continue;
        if (name === 'style') {
            const scrubbed = scrubStyle(value);
            if (scrubbed === null) continue;
            dest.setAttribute('style', scrubbed);
            continue;
        }
        dest.setAttribute(name, value);
    }
    // Harden external links opened in a new tab against reverse-tabnabbing.
    if (tag === 'a' && dest.getAttribute('target') === '_blank') {
        dest.setAttribute('rel', 'noopener noreferrer');
    }
}

function sanitizeChildren(src: Node, dest: Node, doc: Document): void {
    for (const child of Array.from(src.childNodes)) {
        if (child.nodeType === 3 /* TEXT_NODE */) {
            dest.appendChild(doc.createTextNode(child.nodeValue ?? ''));
            continue;
        }
        if (child.nodeType !== 1 /* ELEMENT_NODE */) continue; // drop comments, CDATA, PIs
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (DANGEROUS_TAGS.has(tag)) continue; // remove entirely — do not surface its text
        if (!ALLOWED_TAGS.has(tag)) {
            sanitizeChildren(el, dest, doc); // unknown-but-benign → unwrap, keep sanitized children
            continue;
        }
        const clean = doc.createElement(tag);
        copyAttributes(el, clean, tag);
        sanitizeChildren(el, clean, doc);
        dest.appendChild(clean);
    }
}

/** Best-effort scrub for environments without a DOM parser (SSR/Node). */
function fallbackScrub(html: string): string {
    return html
        .replace(/<\s*(script|style|iframe|object|embed|form|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '');
}

/**
 * The built-in sanitizer. Parses `html` with the platform DOMParser, rebuilds an
 * allowlisted tree, and re-serializes it. Falls back to a regex scrub only when
 * no DOMParser exists (non-browser runtime).
 */
export const defaultSanitizer: AparteSanitizer = (html: string): string => {
    if (!html) return html;
    if (typeof DOMParser === 'undefined') return fallbackScrub(html);
    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
        return fallbackScrub(html);
    }
    const container = doc.createElement('div');
    sanitizeChildren(doc.body, container, doc);
    return container.innerHTML;
};
