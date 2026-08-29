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
 * coverage, register DOMPurify via `aparteGlobalConfig.setHtmlSanitizer`.
 */

export type AparteSanitizer = (html: string) => string;

/**
 * Tags dropped wholesale — content and all (never unwrapped to text).
 *
 * Exported for the DOM-free path's own suite: both of `fallbackScrub`'s regexes
 * are built from this Set, and the test that proves it loops over the Set rather
 * than a copy. Not re-exported from the package barrel — it is core's list, not
 * a contract.
 */
export const DANGEROUS_TAGS = new Set([
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
    // `id`/`name` are intentionally NOT allowlisted — they enable DOM clobbering
    // and LLM-authored markup has no legitimate need for author-controlled ids.
    'class', 'style', 'title', 'dir', 'lang', 'role', 'align',
    'aria-label', 'aria-hidden', 'aria-describedby', 'aria-level',
]);

/** Extra attributes allowed on specific tags. */
const TAG_ATTRS: Record<string, Set<string>> = {
    // `target` and `rel` are NOT copied from the model's markup — `copyAttributes`
    // decides both below. Legacy `name` is dropped too (obsolete + a DOM-clobbering
    // vector).
    a: new Set(['href']),
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
/**
 * `data:` URLs are only honoured for images, and only for a NAMED image subtype.
 *
 * The subtype group used to be optional (`(?:png|…)?`), so `data:image/,x` and
 * `data:image/;whatever,` sailed through with no media type at all.
 *
 * `svg+xml` is deliberately kept. An SVG loaded through `<img src>` runs in
 * secure-static mode — no scripts, no external fetches — in every engine, and
 * dropping it would break the legitimate case (a model emitting an inline chart
 * or icon). What it must NOT do is travel: an app that moves this URL into an
 * `<object>`, `<embed>` or an iframe leaves secure-static mode and the SVG
 * becomes executable. That constraint belongs to whoever re-hosts it.
 */
const SAFE_DATA_IMG = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|svg\+xml)[;,]/i;
/** Whitespace + C0 control chars, used to obfuscate a scheme (e.g. " javascript:" or "java\tscript:"). */
// eslint-disable-next-line no-control-regex -- stripping C0 control chars is intentional (anti-obfuscation)
const CONTROL_WS = /[\u0000-\u0020]+/g;

/**
 * A URL that leaves this site: `https://host`, `http://host`, the scheme-relative
 * `//host` a browser resolves against the page's own scheme, and the two
 * spellings of those a URL parser accepts but a reader does not expect.
 *
 * It is tested against a value already run through `CONTROL_WS`, the same
 * normalisation the accept path (`isSafeUrl`) applies. The check used to read the
 * RAW attribute against `^https?:\/\//`, so `//attacker.example` and
 * `" https://attacker.example"` — both accepted, both external — kept the default
 * target and navigated the frame the chat lives in, which is the one thing the
 * hardening in `copyAttributes` exists to prevent.
 *
 * Two more spellings then survived that widening, and the allowlist accepts both:
 * a BACKSLASH is a slash to a URL parser on a special scheme (`/\evil.example`
 * matches `RELATIVE_URL`'s leading `/`), and a SINGLE slash after an explicit
 * scheme enters authority state when that scheme differs from the page's
 * (`http:/evil.example` matches `SAFE_URL`). Measured with Node's WHATWG URL
 * against base `https://site.example/chat/`: `/\evil.example` →
 * `https://evil.example/`, `http:/evil.example` and `http:/\evil.example` →
 * `http://evil.example/`. Hence `[/\\]` in both branches.
 *
 * `https:/path` — a single slash after the SAME scheme — matches too and resolves
 * same-site. Sending that one degenerate spelling to a new tab is harmless; the
 * alternative is resolving, which is exactly what this must not do.
 *
 * Deliberately NOT `new URL(v, document.baseURI)`: this module has a documented
 * DOM-free path, and resolving would silently turn the rule into "cross-origin"
 * rather than "external".
 */
const EXTERNAL_URL = /^(?:https?:)?[/\\]{2}|^https?:[/\\]/i;

/** Core owns this prefix on every class it emits, so nothing model-authored may wear one. */
const APARTE_CLASS = /^aparte-/i;

/**
 * True when a URL is safe to place in a `href`/`src` attribute. Exported so a
 * streaming renderer (which bypasses the one-shot `sanitizeHtml`) can apply the
 * same URL policy live. `tag` is the host element ('a', 'img', …) — `data:image`
 * URLs are only allowed on `img`.
 */
/**
 * `srcset` carries N candidate URLs, so the single-URL check does not fit it —
 * and splitting on commas is unreliable, because a `data:` URL legitimately
 * contains one (`data:image/png;base64,AAA 2x, small.png 1x`).
 *
 * So rather than parse candidates, every SCHEME token in the value must itself
 * resolve to an allowed URL: a relative-only srcset has none and passes, while a
 * smuggled scheme is rejected wherever in the value it sits.
 *
 * Found by an audit: `srcset` previously had only a `javascript:|vbscript:`
 * substring test, so `srcset="data:text/html,<script>…</script> 1x"` walked
 * straight through the allowlist that rejects the very same URL on `src`. Low
 * severity — a browser only ever decodes a srcset candidate as an image, never as
 * a document — but the allowlist should not have two different answers for one
 * URL depending on which attribute carries it.
 *
 * `<source>` is validated as `img`: inside a `<picture>` its candidates feed an
 * `<img>`, so the `data:image` policy is the same one that applies there.
 */
function isSafeSrcset(value: string, tag: string): boolean {
    const urlTag = tag === 'source' ? 'img' : tag;
    for (const m of value.matchAll(/[a-z][a-z0-9+.-]*:[^\s,]*/gi)) {
        if (!isSafeUrl(m[0], urlTag)) return false;
    }
    return true;
}

export function isSafeUrl(value: string, tag: string): boolean {
    const v = value.replace(CONTROL_WS, '');
    if (!v) return true; // empty href/src is harmless
    if (SAFE_URL.test(v)) return true;
    if (tag === 'img' && SAFE_DATA_IMG.test(v)) return true;
    // Any other explicit scheme (javascript:, vbscript:, data: on non-img, …) is rejected.
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
    return RELATIVE_URL.test(v);
}

/**
 * Inert, presentational inline-style properties a syntax highlighter / markdown
 * renderer actually emits. An allowlist (not a blocklist) so layout & positioning
 * properties — `position`, `z-index`, `inset`, `top/left/right/bottom`, `width`,
 * `height`, `transform`, … — are dropped by default: those are what a hostile
 * `style` would need to build a full-viewport click-jacking overlay.
 */
const SAFE_STYLE_PROPS = new Set([
    'color', 'background-color',
    'font-style', 'font-weight', 'font-family', 'font-size',
    'font-variant', 'font-variant-ligatures',
    'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
    'white-space',
]);

/**
 * A custom property a highlighter may set, as opposed to one of ours it may not.
 *
 * The allowlist above says what it is for — "properties a syntax highlighter / markdown
 * renderer actually emits" — and it predates dual-theme highlighting. Shiki's documented
 * way to render for light AND dark is `defaultColor: false`, which emits NOTHING but
 * custom properties (`--shiki-light`, `--shiki-dark`) and leaves the choosing to CSS. So
 * every declaration was dropped and every code block came out white: the feature was
 * unreachable, not merely unstyled.
 *
 * Two rules, and the second is the one that matters. A custom property is inert on its
 * own — it paints nothing until some CSS reads it — so the value scrubbing below is what
 * keeps it safe, and it applies unchanged. But core's ENTIRE theme is custom properties,
 * so a model-authored block setting `--aparte-primary` could repaint the chat around it.
 * That is not highlighting, it is defacement with our own paint, so our namespace is
 * refused.
 */
function isSafeCustomProperty(prop: string): boolean {
    /*
     * A backslash disqualifies the name outright, and the reason is the asymmetry
     * between the two checks in `scrubStyle`.
     *
     * `SAFE_STYLE_PROPS.has(prop)` is an ALLOWLIST, so an escape defeats itself:
     * `col\6fr` is not in the set, so the declaration is dropped. This test is a
     * DENYLIST — "any custom property except ours" — and an escape defeats a denylist
     * the other way round: `--\61 parte-text` does not start with `--aparte-`, so it
     * passed, and the browser decodes the ident back to `--aparte-text`. A
     * prompt-injected model could repaint core's own theme inside whatever element a
     * markdown or highlight provider gave it.
     *
     * Refused rather than decoded, for the reason the value check below already gives:
     * decoding is the general fix and is easy to get wrong (stripping the escape from
     * `u\72 l(` yields `ul(`, not `url(` — which is how an earlier attempt passed its
     * own test). No custom property worth setting from model-authored content needs a
     * CSS escape, so refusing costs nothing and leaves nothing to decode correctly.
     *
     * This does not rest on how a particular engine decodes anything: the invariant is
     * that our namespace is unreachable, and it is enforced by the escape never
     * surviving rather than by predicting what it would become.
     */
    if (prop.includes('\\')) return false;
    return prop.startsWith('--') && !prop.startsWith('--aparte-');
}

/**
 * Keep only allowlisted inline-style declarations, and reject any `url()` beacon,
 * legacy `expression()`, or scheme even on an allowlisted property.
 */
function scrubStyle(value: string): string | null {
    const kept: string[] = [];
    for (const decl of value.split(';')) {
        const trimmed = decl.trim();
        const idx = trimmed.indexOf(':');
        if (idx === -1) continue;
        const prop = trimmed.slice(0, idx).trim().toLowerCase();
        const val = trimmed.slice(idx + 1);
        if (!val.trim()) continue;
        if (!SAFE_STYLE_PROPS.has(prop) && !isSafeCustomProperty(prop)) continue;
        // A CSS identifier escape is a legal spelling of any character, so
        // `u\72 l(//evil)` is `url(//evil)` written to walk straight past a
        // regex looking for the letters. DECODING it would be the general fix and
        // is easy to get wrong — stripping the escape yields `ul(`, not `url(`,
        // which is how the first attempt at this passed its own test.
        //
        // So: no backslash survives here at all. None of the properties this
        // allowlist keeps (colours, font weights, text-decoration, white-space)
        // has any legitimate use for a CSS escape, so refusing them outright
        // costs nothing and leaves nothing to decode correctly.
        if (val.includes('\\')) continue;
        if (/url\s*\(|expression\s*\(|javascript:|vbscript:|[<>]/i.test(val)) continue;
        kept.push(trimmed); // preserve the original declaration text (no reformatting)
    }
    return kept.length ? kept.join('; ') : null;
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
        if (name === 'srcset' && !isSafeSrcset(value, tag)) continue;
        if (name === 'style') {
            const scrubbed = scrubStyle(value);
            if (scrubbed === null) continue;
            dest.setAttribute('style', scrubbed);
            continue;
        }
        if (name === 'class') {
            // `class` is allowlisted because a highlighter's output is mostly
            // classes — and that let model-authored markup WEAR core's own names:
            // `<div class="aparte-approval-option aparte-btn">Approve</div>` painted
            // a pixel-perfect approval button inside the transcript, and every other
            // core surface can be forged the same way. Core owns the `aparte-` prefix
            // wherever it emits a class, so nothing arriving from a provider keeps
            // one. Everything else survives, `language-*` included — that is the
            // class highlighters are identified by, and it is not ours.
            const kept = value.split(/\s+/).filter((token) => token && !APARTE_CLASS.test(token));
            if (!kept.length) continue;
            dest.setAttribute('class', kept.join(' '));
            continue;
        }
        dest.setAttribute(name, value);
    }
    if (tag === 'a') {
        // An external link opens in its own tab by default. The link was written by
        // the model, and a bare `<a href="https://…">` navigates the frame the chat
        // lives in — in an Electron window, the whole application (issue #38). `marked`
        // sets no `target`, so until now every reply link did exactly that. A host that
        // routes links itself listens for the bubble's cancelable `aparte-link-click`.
        // Same-site and in-page links (relative, `#`, `mailto:`) are left as written.
        //
        // What the model does NOT get is the choice. `target` used to be copied
        // through, so `_top`/`_parent` broke out of the frame anyway — no external URL
        // required — and a NAMED target (`target="victimframe"`) opened a page holding
        // a live `window.opener`, the reverse-tabnabbing this code hardens against two
        // lines down. `rel` came through too, so `rel="opener"` simply cancelled it.
        // So the attribute is read as a WISH and clamped: `_self` is honoured
        // where it changes nothing a browser would not already do — i.e. on a link
        // that was staying here anyway — and anything else becomes a new tab that
        // cannot reach back. `_self` on an EXTERNAL href is not a preference, it
        // is a downgrade: the same link with no `target` opens a new tab, so
        // honouring it would hand the model precisely the outcome named above.
        const href = (dest.getAttribute('href') ?? '').replace(CONTROL_WS, '');
        const wish = (src.getAttribute('target') ?? '').trim().toLowerCase();
        if (wish === '_self' && !EXTERNAL_URL.test(href)) {
            dest.setAttribute('target', '_self');
        } else if (wish || EXTERNAL_URL.test(href)) {
            dest.setAttribute('target', '_blank');
            // Harden links opened in a new tab against reverse-tabnabbing.
            dest.setAttribute('rel', 'noopener noreferrer');
        }
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

/**
 * The three document-structure tags, kept out of the paired pass below: a real
 * parser hoists them and keeps what they wrapped, so eating their content would
 * lose the answer rather than protect anyone. Their tags still go (the lone pass
 * takes them, `<body onload=…>` included).
 */
const UNWRAPPED_TAGS = new Set(['html', 'head', 'body']);

const DANGEROUS_ALT = Array.from(DANGEROUS_TAGS).join('|');
const DANGEROUS_PAIRED_ALT = Array.from(DANGEROUS_TAGS).filter((t) => !UNWRAPPED_TAGS.has(t)).join('|');

/** `<script>…</script>` — the tag and everything it wrapped. */
const PAIRED_DANGEROUS = new RegExp(`<\\s*(${DANGEROUS_PAIRED_ALT})\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi');
/** Whatever the pass above could not pair: an unclosed `<svg>`, a stray `</form>`. */
const LONE_DANGEROUS = new RegExp(`<\\s*\\/?\\s*(?:${DANGEROUS_ALT})\\b[^>]*>`, 'gi');
/**
 * An inline handler, and what may sit in front of it. HTML ends an attribute at a
 * space, at `/`, and at the closing quote of the previous value — so
 * `<img src=x/onerror=…>` and `<img src="x"onerror="…">` are both handlers, and a
 * leading `\s` saw neither. The match is replaced by a SPACE, not by nothing, so
 * removing the attribute cannot glue its neighbours into one token.
 */
const INLINE_HANDLER = /["'/\s]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/**
 * A URL-bearing attribute carrying an executable (or document-typed) scheme.
 * Unanchored on purpose: unlike the handler above it requires no separator, so
 * demanding one would only create a hole (`<a x=1href=javascript:…>`).
 */
const UNSAFE_SCHEME_ATTR = /(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|(?:javascript|vbscript|data):[^\s>]*)/gi;

/**
 * Best-effort scrub for environments WITHOUT a DOM parser (SSR/Node). A regex
 * pass cannot match a real HTML parser and has known evasions (split attributes,
 * unclosed tags, entity tricks): it is a safety net, **not** a security boundary.
 * For untrusted content on a non-browser runtime, register a real sanitizer
 * (e.g. DOMPurify + jsdom) via `aparteGlobalConfig.setHtmlSanitizer`.
 *
 * Both tag passes read `DANGEROUS_TAGS`, the one list the DOM path uses. They
 * used to be two hand-written lists that disagreed — `svg`, `math` and `form`
 * were only in the paired pass, so an UNCLOSED one walked straight through, and
 * `button`/`select`/`title`/… were in neither.
 */
function fallbackScrub(html: string): string {
    let out = html.replace(PAIRED_DANGEROUS, '').replace(LONE_DANGEROUS, '');
    // Run the handler pass to a FIXED POINT. The match consumes the separator in
    // front of it, so two handlers written back to back
    // (`<img src=x onload="0"onerror="alert(1)">`) lose the quote that would have
    // separated the second one and it survives a single pass — a live `on*`
    // attribute out of the very net this function is. The replacement inserts a
    // space, which restores the separator for the next round. Bounded: every
    // match is at least six characters and becomes one, so each pass is strictly
    // shorter.
    for (let next = out.replace(INLINE_HANDLER, ' '); next !== out; next = out.replace(INLINE_HANDLER, ' ')) {
        out = next;
    }
    return out.replace(UNSAFE_SCHEME_ATTR, ' ');
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
