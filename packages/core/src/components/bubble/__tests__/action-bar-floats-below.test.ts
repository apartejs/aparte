// @vitest-environment jsdom
/**
 * #56 — an older message's action bar floats BELOW the message, in the space that
 * already separates two turns, and reserves nothing.
 *
 * It used to float top-right, over the header row's empty end, because the bubble is
 * a paint-containment boundary (`content-visibility: auto`) and the inter-bubble gap
 * was a flex `gap` — outside every box, so a bar floating under the text was clipped.
 * The gap is the bubble's own padding now, inside its box: the bar floats over
 * `message padding + gap` (16 + 12 = 28 px at the default density), under the text,
 * and the distance between turns does not change.
 *
 * jsdom lays nothing out; these read the stylesheet the way the browser will.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

// Comments stripped: a rationale that quotes `{ box-sizing: border-box }` would otherwise
// end a rule body early.
const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: RegExp): string => css.match(new RegExp(selector.source + String.raw`\s*\{([^}]*)\}`, selector.flags))?.[1] ?? '';

describe('#56 — the action bar floats below the message', () => {
    it('the floating footer sits at the bubble\'s bottom edge, under the text — not top-right', () => {
        const body = rule(/aparte-chat-bubble:not\(:last-of-type\) \.aparte-message:not\(\[data-branches\]\) \.aparte-footer,\s*aparte-chat-bubble:last-of-type \.aparte-message\[data-role="user"\]:not\(\[data-branches\]\) \.aparte-footer/);
        expect(body, 'the floating rule exists').not.toBe('');
        expect(body).toMatch(/position:\s*absolute/);
        expect(body).toMatch(/inset-block-end:/);
        expect(body).toMatch(/inset-inline-start:\s*0/);
        expect(body).not.toMatch(/\btop:/);
        expect(body).not.toMatch(/inset-inline-end:/);
    });

    it('the inter-bubble gap is the bubble\'s own padding, so a bar under the text is inside the contained box', () => {
        expect(rule(/^\.aparte-messages-wrapper/m)).toMatch(/gap:\s*0/);
        expect(rule(/^aparte-chat-bubble/m)).toMatch(/padding-block-end:\s*var\(--aparte-message-gap\)/);
        // Framework-managed mode: the host is the list.
        // The host selector heads several rules; the one that lays the column out says gap: 0.
        const hostBlocks = [...css.matchAll(/aparte-chat-viewport\.aparte-viewport--framework,\s*aparte-chat-viewport\[framework-managed\]\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
        expect(hostBlocks.length).toBeGreaterThan(0);
        expect(hostBlocks.some((b) => /gap:\s*0/.test(b))).toBe(true);
        expect(hostBlocks.some((b) => /gap:\s*var\(--aparte-message-gap\)/.test(b))).toBe(false);
        expect(css).not.toMatch(/margin-block-start:\s*calc\(var\(--aparte-message-gap\) \* -1\)/);
    });

    it('the bar is anchored to the content column, so it starts where the text starts', () => {
        expect(rule(/^\.aparte-body/m)).toMatch(/position:\s*relative/);
    });

    it('the message padding is split so the offset can be computed from tokens', () => {
        expect(css).toMatch(/--aparte-message-padding-block:\s*var\(--aparte-space-8\)/);
        expect(css).toMatch(/--aparte-message-padding:\s*var\(--aparte-message-padding-block\) var\(--aparte-message-padding-inline\)/);
    });
});
