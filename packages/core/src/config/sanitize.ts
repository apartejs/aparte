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
 * the realistic threat model (LLM-emitted markup). For an audited parser on top
 * of it, chain DOMPurify IN FRONT:
 * `setHtmlSanitizer((html) => defaultSanitizer(DOMPurify.sanitize(html)))`.
 * Registering DOMPurify alone replaces this one, and its defaults keep what a
 * chat must refuse — measured on DOMPurify 3.4: inline layout styles, `aparte-`
 * classes, `--aparte-*` properties, `<form>`/`<button>`, a password `<input>`,
 * `id`, and an external link left to navigate the chat's own frame.
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
    'input', // GFM task-list checkboxes only — `sanitizeChildren` drops every other `type`, and disables these
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
 * The subtype is required, so `data:image/,x` and `data:image/;whatever,` (no media
 * type at all) are refused.
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
 * normalisation the accept path (`isSafeUrl`) applies, so `//attacker.example` and
 * `" https://attacker.example"` count as external and get a new tab rather than
 * navigating the frame the chat lives in.
 *
 * Two more spellings are external, and the allowlist accepts both: a BACKSLASH is a
 * slash to a URL parser on a special scheme (`/\evil.example` matches
 * `RELATIVE_URL`'s leading `/`), and a SINGLE slash after an explicit scheme enters
 * authority state when that scheme differs from the page's (`http:/evil.example`
 * matches `SAFE_URL`). With Node's WHATWG URL against base
 * `https://site.example/chat/`: `/\evil.example` → `https://evil.example/`,
 * `http:/evil.example` and `http:/\evil.example` → `http://evil.example/`. Hence
 * `[/\\]` in both branches.
 *
 * An explicit `http:` / `https:` with no slash at all (`http:evil.example`) is the same
 * thing: on an `https` page it resolves to `http://evil.example/`. So ANY explicit http(s)
 * scheme is external here, `https:/path` and `https:path` included — those resolve same-site,
 * and sending that degenerate spelling to a new tab is harmless; the alternative is
 * resolving, which is exactly what this must not do.
 *
 * Deliberately NOT `new URL(v, document.baseURI)`: this module has a documented
 * DOM-free path, and resolving would silently turn the rule into "cross-origin"
 * rather than "external".
 */
const EXTERNAL_URL = /^(?:https?:)?[/\\]{2}|^https?:/i;

/** Core owns this prefix on every class it emits, so nothing model-authored may wear one. */
const APARTE_CLASS = /^aparte-/i;

/**
 * The attributes core READS, as a command or as a boundary, on an element it finds by
 * walking the DOM: a delegated click listener (`data-aparte-dialog-open`, the sidebar
 * and split toggles, the launcher's close and maximize), the chat that owns a card's `send`
 * (`data-aparte-chat`), the instance config a subtree resolves to (`data-aparte-host`),
 * the palette a subtree wears (`data-aparte-theme`), a checkpoint's Restore
 * (`data-checkpoint-action`), the row a segment update targets (`data-segment-id`).
 *
 * `data-*` is otherwise kept (see `copyAttributes`), so these are the exceptions: model
 * markup is text, and text cannot press a button or move a boundary core drew. The list
 * is exact rather than the whole `data-aparte-` prefix on purpose — a Markdown provider
 * writes `data-aparte-open` before the sanitizer runs, and core marks its own state on
 * DOM the sanitizer sees again (`data-aparte-highlighted`) — and
 * `the-sanitizer-refuses-what-core-reads.test.ts` scans core's source so an attribute
 * added there cannot be forgotten here. Exported for that test; not from the barrel.
 */
export const RESERVED_ATTRIBUTES = new Set([
    'data-aparte-chat', 'data-aparte-host', 'data-aparte-theme',
    'data-aparte-split-pane', 'data-aparte-launcher-close', 'data-aparte-launcher-maximize', 'data-aparte-suggestions',
    'data-aparte-bubble', 'data-aparte-empty', 'data-aparte-panel', 'data-aparte-panel-host',
    'data-aparte-card-part',
    'data-segment-id', 'data-action',
]);

/** Families of reserved attributes: `-open`/`-close`/`-static`, `-toggle`/`-search`, `-action`/`-reason`. */
export const RESERVED_ATTRIBUTE_PREFIXES = ['data-aparte-dialog-', 'data-aparte-sidebar-', 'data-checkpoint-'];

/** True when `name` (lower case) is an attribute core reads, so model markup may not carry it. */
export function isReservedAttribute(name: string): boolean {
    return RESERVED_ATTRIBUTES.has(name) || RESERVED_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * The `role` values model markup may NOT carry: the widget roles. A `textbox`, `button`,
 * `link`, `checkbox`, `switch`, `tab`… tells assistive technology — and core's own
 * `[role="textbox"]` lookups — that an element is a control, which a model-written element
 * is not. Every other role describes structure, a landmark or a live region (`region`, `group`,
 * `status`, `alert`, `math`, `term`, the `doc-*` ones…) and does nothing, so it stays: a deny
 * list of widgets rather than an allowlist of 15 documents, which also dropped those.
 */
const WIDGET_ROLES = new Set([
    'button', 'link', 'checkbox', 'textbox', 'searchbox', 'combobox', 'switch', 'tab',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'slider', 'spinbutton',
    'scrollbar', 'treeitem', 'gridcell', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist',
    'tree', 'treegrid', 'grid', 'dialog', 'alertdialog', 'application', 'toolbar',
    'progressbar', 'tabpanel',
]);

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
 * A `srcset` of `data:text/html,<script>…</script> 1x` is rejected, the same as that
 * URL on `src`. A browser only ever decodes a srcset candidate as an image, never as
 * a document, so the risk is low, but the allowlist gives one answer for one URL
 * whichever attribute carries it.
 *
 * `<source>` is validated as `img`: inside a `<picture>` its candidates feed an
 * `<img>`, so the `data:image` policy is the same one that applies there.
 */
function isSafeSrcset(value: string, tag: string): boolean {
    const urlTag = tag === 'source' ? 'img' : tag;
    // A scheme starts at the beginning of the value or right after a character that cannot be part
    // of one (whitespace, a comma, a control, a slash…). Anchoring there matters for cost: without
    // it every position inside a long run of scheme characters starts a scan to the end of the run,
    // which is quadratic. (No lookbehind: older Safari fails to parse the whole module on one.)
    for (const m of value.matchAll(/(?:^|[^a-z0-9+.-])([a-z][a-z0-9+.-]*:[^\s,]*)/gi)) {
        if (!isSafeUrl(m[1]!, urlTag)) return false;
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
 * The allowlist above covers the properties a syntax highlighter / markdown renderer
 * actually emits, and that includes dual-theme highlighting. Shiki's documented way to
 * render for light AND dark is `defaultColor: false`, which emits NOTHING but custom
 * properties (`--shiki-light`, `--shiki-dark`) and leaves the choosing to CSS; if those
 * were dropped, every code block would come out white.
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

/**
 * What is kept of one attribute (`name` lower case): its value, as it will be written, or
 * `null` when it is dropped. The one rule both paths apply — the DOM walk and the DOM-free
 * scrub — so a server render keeps what the browser render keeps and refuses what it refuses.
 */
function keepAttribute(tag: string, name: string, value: string): string | null {
    const extra = TAG_ATTRS[tag];
    // Event handlers and form-action overrides are never allowed.
    if (name.startsWith('on') || name.startsWith('formaction')) return null;
    // data-* attributes are inert (no execution path) and widely emitted by
    // markdown/highlight tooling — allowed, matching DOMPurify's default. Except the
    // ones core itself reads as a command or a boundary: see `RESERVED_ATTRIBUTES`.
    if (!name.startsWith('data-') && !GLOBAL_ATTRS.has(name) && !(extra && extra.has(name))) return null;
    if (isReservedAttribute(name)) return null;
    if (name === 'role' && value.trim().toLowerCase().split(/\s+/).some((role) => WIDGET_ROLES.has(role))) return null;
    if (URL_ATTRS.has(name) && !isSafeUrl(value, tag)) return null;
    if (name === 'srcset' && !isSafeSrcset(value, tag)) return null;
    if (name === 'style') return scrubStyle(value);
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
        return kept.length ? kept.join(' ') : null;
    }
    return value;
}

/**
 * The `target` and `rel` an `<a>` gets. The model's `target` is read as a WISH and clamped;
 * `rel` is never copied. `href` is the one that was kept ('' when it was dropped).
 */
function linkAttributes(href: string, targetWish: string): Array<[string, string]> {
    // An external link opens in its own tab by default. The link was written by
    // the model, and a bare `<a href="https://…">` navigates the frame the chat
    // lives in — in an Electron window, the whole application. `marked`
    // sets no `target`, so without this every reply link would do exactly that. A host that
    // routes links itself listens for the bubble's cancelable `aparte-link-click`.
    // Same-site and in-page links (relative, `#`, `mailto:`) are left as written.
    //
    // What the model does NOT get is the choice. Copying `target` through would let
    // `_top`/`_parent` break out of the frame — no external URL required — and a
    // NAMED target (`target="victimframe"`) open a page holding a live
    // `window.opener`, the reverse-tabnabbing this code hardens against two lines
    // down. `rel` is not copied either, so `rel="opener"` cannot cancel it.
    // So the attribute is read as a WISH and clamped: `_self` is honoured
    // where it changes nothing a browser would not already do — i.e. on a link
    // that was staying here anyway — and anything else becomes a new tab that
    // cannot reach back. `_self` on an EXTERNAL href is not a preference, it
    // is a downgrade: the same link with no `target` opens a new tab, so
    // honouring it would hand the model precisely the outcome named above.
    const target = href.replace(CONTROL_WS, '');
    const wish = targetWish.trim().toLowerCase();
    if (wish === '_self' && !EXTERNAL_URL.test(target)) return [['target', '_self']];
    // Harden links opened in a new tab against reverse-tabnabbing.
    if (wish || EXTERNAL_URL.test(target)) return [['target', '_blank'], ['rel', 'noopener noreferrer']];
    return [];
}

function copyAttributes(src: Element, dest: Element, tag: string): void {
    for (const attr of Array.from(src.attributes)) {
        const name = attr.name.toLowerCase();
        const kept = keepAttribute(tag, name, attr.value);
        if (kept !== null) dest.setAttribute(name, kept);
    }
    if (tag === 'a') {
        for (const [name, value] of linkAttributes(dest.getAttribute('href') ?? '', src.getAttribute('target') ?? '')) dest.setAttribute(name, value);
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
        // `input` is allowlisted for ONE thing — a GFM task-list checkbox. Any other type, or
        // none (a text box), is dropped whole: `<input type="password" title="API key">`
        // would put a credential prompt in a reply. Nothing reads what is typed (`form`,
        // `button` and `name` are refused, `on*` never copied), so the ASK is the attack.
        // A kept checkbox is forced `disabled`: the model's checkbox is a picture of a
        // list item, not a control.
        const isInput = tag === 'input';
        if (isInput && (el.getAttribute('type') ?? '').trim().toLowerCase() !== 'checkbox') continue;
        const clean = doc.createElement(tag);
        copyAttributes(el, clean, tag);
        // Written back canonically: the test above trims and lowercases, a browser does not
        // (`type="checkbox "` is an invalid type, so a text box), and the model's spelling
        // would otherwise be the one that renders.
        if (isInput) {
            clean.setAttribute('type', 'checkbox');
            clean.setAttribute('disabled', '');
        }
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

/**
 * Dangerous tags that have no content, so their start tag is all there is to remove. Every other
 * dangerous tag (bar the three above) takes what it wraps with it, up to its end tag; with no end
 * tag it takes the rest of the text, as an unclosed `script`, `svg` or `form` does in a browser.
 */
const VOID_DANGEROUS = new Set(['link', 'meta', 'base', 'embed', 'frame']);

/** The end tag of a dangerous element: one global regex per name, read through `lastIndex`. */
const END_TAGS = new Map<string, RegExp>();
function endTag(tag: string): RegExp {
    let re = END_TAGS.get(tag);
    if (!re) { re = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'gi'); END_TAGS.set(tag, re); }
    return re;
}

/** Where a comment ends, as a browser reads it: `-->` or `--!>`. */
const COMMENT_END = /--!?>/g;

const ASCII_LETTER = /[A-Za-z]/;
const SPACE = /\s/;
const NAME_END = /[\s/>]/;
const ATTR_NAME_END = /[\s/>=]/;
const SAFE_ATTR_NAME = /^[a-z][a-z0-9_.:-]*$/;
const NAMED_ENTITY: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', lpar: '(', rpar: ')', sol: '/', bsol: '\\',
    period: '.', comma: ',', semi: ';', num: '#', excl: '!', quest: '?', tab: '\t', newline: '\n',
};

/**
 * An attribute value as the browser would read it, for the entities that can spell a character a
 * check looks for (`java&#115;cript:`, `u&#114;l(`, `&colon;`). The scrub judges THIS text and
 * writes it back escaped, so the page reads exactly what was judged, whatever else a browser
 * would have decoded.
 */
function decodeEntities(value: string): string {
    if (!value.includes('&')) return value;
    return value.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));?/gi, (whole, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
        if (named !== undefined) return NAMED_ENTITY[named.toLowerCase()] ?? whole;
        const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? '', 10);
        return code > 0 && code <= 0x10FFFF && (code < 0xD800 || code > 0xDFFF) ? String.fromCodePoint(code) : '\uFFFD';
    });
}

const escapeValue = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One start tag, rebuilt: the allowed tags with the attributes `keepAttribute` keeps, written in
 * one canonical form. A tag the DOM path would unwrap is dropped; a checkbox becomes a fixed
 * disabled one, any other `input` goes.
 */
function rebuildTag(tag: string, attrs: Array<[string, string]>): string {
    if (!ALLOWED_TAGS.has(tag)) return '';
    const isInput = tag === 'input';
    const attr = (name: string): string | undefined => attrs.find(([n]) => n === name)?.[1];
    if (isInput && (attr('type') ?? '').trim().toLowerCase() !== 'checkbox') return '';
    const written: string[] = [];
    if (isInput) {
        written.push('type="checkbox"');
        if (attr('checked') !== undefined) written.push('checked');
        written.push('disabled');
    }
    for (const [name, value] of attrs) {
        if (!SAFE_ATTR_NAME.test(name) || (isInput && (name === 'type' || name === 'checked' || name === 'disabled'))) continue;
        const kept = keepAttribute(tag, name, value);
        if (kept !== null) written.push(`${name}="${escapeValue(kept)}"`);
    }
    if (tag === 'a') {
        const href = attrs.find(([n]) => n === 'href');
        const kept = href ? keepAttribute('a', 'href', href[1]) : null;
        for (const [name, value] of linkAttributes(kept ?? '', attr('target') ?? '')) written.push(`${name}="${value}"`);
    }
    return `<${tag}${written.length ? ' ' + written.join(' ') : ''}>`;
}

/**
 * One tag read from `nameAt` (the first letter of its name) the way a browser's tokenizer reads
 * it: a quote ends where its match is, an unquoted value at a space or `>`, `/` and a closing
 * quote separate attributes, the first of two equal names wins, and a value is read with the
 * entities that can spell a checked character decoded. `end` is the index past its `>`, or `-1`
 * when the text ends inside the tag.
 *
 * Exported for the image policy's DOM-free pass (`image-policy.ts`), which has to find the same
 * tags in the same text this scrub wrote; not from the package barrel.
 */
export function readTag(html: string, nameAt: number): { tag: string; attrs: Array<[string, string]>; end: number } {
    const n = html.length;
    let j = nameAt;
    while (j < n && !NAME_END.test(html[j]!)) j++;
    const tag = html.slice(nameAt, j).toLowerCase();
    const attrs: Array<[string, string]> = [];
    const seen = new Set<string>();
    while (j < n) {
        while (j < n && (SPACE.test(html[j]!) || html[j] === '/')) j++;
        if (j >= n) break;
        if (html[j] === '>') return { tag, attrs, end: j + 1 };
        const nameStart = j++;
        while (j < n && !ATTR_NAME_END.test(html[j]!)) j++;
        const name = html.slice(nameStart, j).toLowerCase();
        let k = j;
        while (k < n && SPACE.test(html[k]!)) k++;
        let value = '';
        if (html[k] === '=') {
            k++;
            while (k < n && SPACE.test(html[k]!)) k++;
            const quote = html[k];
            if (quote === '"' || quote === "'") {
                const end = html.indexOf(quote, k + 1);
                if (end < 0) break;
                value = html.slice(k + 1, end);
                j = end + 1;
            } else {
                const valueStart = k;
                while (k < n && !SPACE.test(html[k]!) && html[k] !== '>') k++;
                value = html.slice(valueStart, k);
                j = k;
            }
        }
        if (!seen.has(name)) { seen.add(name); attrs.push([name, decodeEntities(value)]); }
    }
    return { tag, attrs, end: -1 };
}

/**
 * Every tag in `html`, read with `readTag` and written again with `rebuildTag`. A tag left open
 * at the end, a bogus comment (`<!x>`, `<?x>`, `</ x>`) and a tag the DOM path would unwrap are
 * dropped; an end tag is reduced to its name.
 */
function rewriteTags(html: string): string {
    const n = html.length;
    let out = '';
    let i = 0;
    while (i < n) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { out += html.slice(i); break; }
        out += html.slice(i, lt);
        if (html.startsWith('<!--', lt)) {
            // `<!-->` and `<!--->` are empty comments; an unclosed one runs to the end.
            const at = lt + 4;
            if (html[at] === '>') i = at + 1;
            else if (html.startsWith('->', at)) i = at + 2;
            else {
                COMMENT_END.lastIndex = at;
                const m = COMMENT_END.exec(html);
                if (!m) break;
                i = m.index + m[0].length;
            }
            continue;
        }
        const closing = html[lt + 1] === '/';
        const nameAt = lt + (closing ? 2 : 1);
        if (!ASCII_LETTER.test(html[nameAt] ?? '')) {
            if (html[lt + 1] === '!' || html[lt + 1] === '?' || closing) {
                const end = html.indexOf('>', lt + 1);
                i = end < 0 ? n : end + 1;
            } else {
                // A lone `<` is text, and is written as text: written raw it would sit next to
                // whatever a dropped construct leaves behind (`<<x>script>`) and spell a tag
                // nothing inspects afterwards.
                out += '&lt;';
                i = lt + 1;
            }
            continue;
        }
        const { tag, attrs, end } = readTag(html, nameAt);
        if (end < 0) break;
        i = end;
        if (closing) { if (ALLOWED_TAGS.has(tag)) out += `</${tag}>`; }
        else if (DANGEROUS_TAGS.has(tag) && !UNWRAPPED_TAGS.has(tag) && !VOID_DANGEROUS.has(tag)) {
            // The element and what it wraps go; with no end tag it wraps the rest of the text.
            const re = endTag(tag);
            re.lastIndex = end;
            const m = re.exec(html);
            if (!m) break;
            i = m.index + m[0].length;
        } else out += rebuildTag(tag, attrs);
    }
    return out;
}

/**
 * Best-effort scrub for environments WITHOUT a DOM parser (SSR/Node). A regex
 * pass cannot match a real HTML parser and has known evasions (split attributes,
 * unclosed tags, entity tricks): it is a safety net, **not** a security boundary.
 * For untrusted content on a non-browser runtime, register a real sanitizer
 * (e.g. DOMPurify + jsdom) via `aparteGlobalConfig.setHtmlSanitizer`.
 *
 * It does apply the same attribute rule as the DOM path (`keepAttribute`), tag by tag, so
 * the attributes core reads as commands (`data-aparte-dialog-open`, `data-segment-id`…),
 * widget roles, `aparte-` classes, layout styles and ids are refused here too, and a
 * task-list checkbox comes out the same. One linear pass does all of it — comments, dangerous elements, tags — and the
 * output is only text (every `<` of the input that is not a tag comes out as `&lt;`) and tags it
 * rebuilt itself, so no later pass has to guess what the text spells. `DANGEROUS_TAGS` is the one
 * list the DOM path uses: an element on it goes with what it wraps, up to its end tag or, with
 * none, the rest of the text, so an UNCLOSED `svg`, `math` or `form` is caught as well as a
 * closed one.
 */
function fallbackScrub(html: string): string {
    return rewriteTags(html);
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
