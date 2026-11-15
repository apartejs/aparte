/**
 * The link target: where a link a reply holds opens.
 *
 * A link the model writes is followed in the frame the chat lives in unless its markup says
 * otherwise, and in a single-page app or an Electron window that frame is the whole app: a
 * coding agent's `[package.json](package.json)` replaced the conversation with a file (#205).
 * So by default (`'new-tab'`) every link a reply holds opens in a new tab, same-site ones
 * included, with `rel="noopener noreferrer"`. `'external-only'` keeps a same-site link in the
 * page and sends another site to a new tab: the sanitizer's own rule (`linkAttributes`), which
 * it applies whatever the mode. Either way a link that stays in the page (`#…`) or hands over to
 * another application (`mailto:`, `tel:`, `sms:`, for which a new tab is left empty) keeps the
 * sanitizer's answer, and the `target` the model wrote is a wish the sanitizer clamps, never a
 * choice.
 *
 * Three readers: `AparteConfig.sanitizeHtml`, after whichever sanitizer is set, so a replaced one
 * keeps the rule (DOMPurify alone drops `target`, and every external link then navigated the
 * chat's own frame); an incremental Markdown provider, as it sets an `href` on a live node; and a
 * plugin that draws links itself. The last two ask `AparteConfig.decideLink`.
 */
import { escapeAttr } from '../utils/escape.js';
import { CONTROL_WS, linkAttributes, readTag } from './sanitize.js';

/** Where the links a reply holds open: every one in a new tab, or only the ones to another site. */
export type AparteLinkTarget = 'new-tab' | 'external-only';

/**
 * What a link drawn by hand sets: `{ target: '_blank', rel: 'noopener noreferrer' }`, a new tab
 * that cannot reach back, or `{}`, the page itself.
 */
export interface AparteLinkDecision {
    readonly target?: '_blank';
    readonly rel?: string;
}

/** A link that stays in the page, or hands over to another application. */
const STAYS = /^(?:#|mailto:|tel:|sms:)/i;
const NEW_TAB: ReadonlyArray<[string, string]> = [['target', '_blank'], ['rel', 'noopener noreferrer']];
const NEW_TAB_DECISION: AparteLinkDecision = Object.freeze({ target: '_blank', rel: 'noopener noreferrer' });
const IN_PLACE: AparteLinkDecision = Object.freeze({});

/**
 * The `target` and `rel` a link to `href` gets under `mode`, `wish` being the `target` its markup
 * asked for: a new tab, unless the mode is `'external-only'` or the link stays in the page or
 * hands over to another app, which get the sanitizer's clamp.
 */
export function linkTargetAttributes(mode: AparteLinkTarget, href: string, wish: string): ReadonlyArray<[string, string]> {
    if (mode !== 'external-only' && !STAYS.test(href.replace(CONTROL_WS, ''))) return NEW_TAB;
    return linkAttributes(href, wish);
}

/** What a link to `href` sets under `mode`, asked for no target of its own: what `decideLink` answers. */
export function linkDecision(mode: AparteLinkTarget, href: string): AparteLinkDecision {
    // With no wish the clamp answers a new tab or nothing, never `_self`.
    return linkTargetAttributes(mode, href, '').length ? NEW_TAB_DECISION : IN_PLACE;
}

/** Whether a string may hold a link: most of what is sanitized holds none. */
const MAY_LINK = /<a[\s/>]/i;

/**
 * Apply the link target to sanitized HTML. Every `<a href>` gets the `target`
 * `linkTargetAttributes` decides from its address and the target it carries; one that opens a
 * new tab also gets `rel` holding what it had plus `noopener noreferrer` (never `opener`), and
 * one that stays in the page keeps its `rel` as written. Both are written after its other
 * attributes so both paths build the same tree. HTML with nothing to
 * change comes back as it came: serialized again, it would be rewritten where the pass changed
 * nothing, and `'external-only'` over the built-in sanitizer changes nothing at all.
 *
 * In a browser it walks an inert `<template>`; without a DOM it reads the tags the way the
 * sanitizer's own DOM-free path does.
 */
export function applyLinkTarget(html: string, mode: AparteLinkTarget): string {
    if (!html || !MAY_LINK.test(html)) return html;
    return typeof document === 'undefined' ? applyLinkTargetWithoutDom(html, mode) : applyInTemplate(html, mode);
}

/**
 * The `rel` a link that opens a new tab ends with: the tokens it had (a sanitizer's `nofollow
 * ugc` is the app's), `noopener` and `noreferrer` added, `opener` dropped as it would
 * contradict `noopener`.
 */
function relForNewTab(rel: string | null | undefined): string {
    const tokens = (rel ?? '').split(/[ \t\n\f\r]+/).filter((token) => token && token.toLowerCase() !== 'opener');
    for (const needed of ['noopener', 'noreferrer']) {
        if (!tokens.some((token) => token.toLowerCase() === needed)) tokens.push(needed);
    }
    return tokens.join(' ');
}

/** What a link is rewritten to: its `target`, and its `rel` only when it opens a new tab. */
interface Settled { readonly target: string | undefined; readonly rel: string | undefined }

/**
 * What to write on a link carrying `target` and `rel` once `decided` is its answer, or `null`
 * when it is as it should be. A link that stays in the page has its `target` settled and its
 * `rel` left alone.
 */
function settle(decided: ReadonlyArray<[string, string]>, target: string | null | undefined, rel: string | null | undefined): Settled | null {
    const wantedTarget = decided.find(([key]) => key === 'target')?.[1];
    if (wantedTarget !== '_blank') return (target ?? undefined) === wantedTarget ? null : { target: wantedTarget, rel: undefined };
    const wantedRel = relForNewTab(rel);
    return (target ?? undefined) === wantedTarget && (rel ?? undefined) === wantedRel ? null : { target: wantedTarget, rel: wantedRel };
}

function applyInTemplate(html: string, mode: AparteLinkTarget): string {
    const template = document.createElement('template');
    template.innerHTML = html;
    let changed = false;
    for (const anchor of Array.from(template.content.querySelectorAll('a[href]'))) {
        const decided = linkTargetAttributes(mode, anchor.getAttribute('href') ?? '', anchor.getAttribute('target') ?? '');
        const settled = settle(decided, anchor.getAttribute('target'), anchor.getAttribute('rel'));
        if (!settled) continue;
        anchor.removeAttribute('target');
        if (settled.target !== undefined) anchor.setAttribute('target', settled.target);
        if (settled.rel !== undefined) {
            anchor.removeAttribute('rel');
            anchor.setAttribute('rel', settled.rel);
        }
        changed = true;
    }
    return changed ? template.innerHTML : html;
}

/** Elements whose text a browser does not read as markup: the pass copies them through. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
const ASCII_LETTER = /[A-Za-z]/;
const SAFE_NAME = /^[a-z][a-z0-9_.:-]*$/;
/** Where a comment ends, as a browser reads it: `-->` or `--!>`. */
const COMMENT_END = /--!?>/g;

/** Past the end of the comment whose `<!--` ends at `at`; an unclosed one runs to the end. */
function commentEnd(html: string, at: number): number {
    if (html[at] === '>') return at + 1;
    if (html.startsWith('->', at)) return at + 2;
    COMMENT_END.lastIndex = at;
    const m = COMMENT_END.exec(html);
    return m ? m.index + m[0].length : html.length;
}

/** One `<a>` start tag, written again only when what it carries is not what is decided. */
function linkTag(written: string, attrs: Array<[string, string]>, mode: AparteLinkTarget): string {
    const attr = (name: string): string | undefined => attrs.find(([key]) => key === name)?.[1];
    const href = attr('href');
    if (href === undefined) return written;
    const decided = linkTargetAttributes(mode, href, attr('target') ?? '');
    const settled = settle(decided, attr('target'), attr('rel'));
    if (!settled) return written;
    const kept = attrs.filter(([name]) => name !== 'target' && (settled.rel === undefined || name !== 'rel') && SAFE_NAME.test(name));
    const added: Array<[string, string]> = [];
    if (settled.target !== undefined) added.push(['target', settled.target]);
    if (settled.rel !== undefined) added.push(['rel', settled.rel]);
    return `<a${[...kept, ...added].map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('')}>`;
}

/**
 * The same pass for a runtime with no DOM (a server render, a Worker). Like the sanitizer's
 * DOM-free path it is a safety net, not a parser: it reads tags with the sanitizer's own reader,
 * leaves comments and raw-text elements alone, and writes back only the tags it changed.
 * Exported for the parity suite; not from the package barrel.
 */
export function applyLinkTargetWithoutDom(html: string, mode: AparteLinkTarget): string {
    if (!html || !MAY_LINK.test(html)) return html;
    const lower = html.toLowerCase();
    const n = html.length;
    let out = '';
    let i = 0;
    while (i < n) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { out += html.slice(i); break; }
        out += html.slice(i, lt);
        if (html.startsWith('<!--', lt)) {
            const stop = commentEnd(html, lt + 4);
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
        if (closing) { out += written; continue; }
        if (RAW_TEXT.has(tag)) {
            const close = lower.indexOf(`</${tag}`, end);
            const stop = close < 0 ? n : close;
            out += written + html.slice(end, stop);
            i = stop;
            continue;
        }
        out += tag === 'a' ? linkTag(written, attrs, mode) : written;
    }
    return out;
}
