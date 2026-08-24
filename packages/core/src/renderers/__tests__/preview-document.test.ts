/**
 * The sandboxed document an artifact previews inside.
 *
 * It had no test of its own, and the gap showed the moment the landing's SVG payload
 * became a real file rather than a hand-written chart: the frame went blank. Not the
 * content, not the CSP, not the sanitizer — the SIZE. The document centres with
 * `display:flex; align-items:center`, and an SVG carrying only a `viewBox` has no
 * intrinsic dimensions, so as a flex item its cross size collapses to zero.
 *
 * Which means the preview worked for the less idiomatic SVG (one that states its own
 * `width`/`height`) and silently showed nothing for the recommended, responsive one a
 * model is most likely to write.
 */
import { describe, it, expect } from 'vitest';
import { buildSafePreviewDocument, PREVIEW_CSP } from '../segments/artifact/preview-document.js';
import { getSegmentRenderer, registerDefaultRenderers } from '../segment-renderers.js';

registerDefaultRenderers();

const VIEWBOX_ONLY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"/></svg>';
const SIZED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" width="320" height="150"><rect width="320" height="150"/></svg>';

describe('the SVG preview document', () => {
    it('gives a viewBox-only SVG a size, because centring collapses it otherwise', () => {
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');

        // Narrowed by attribute selector on purpose: it is exactly the SVG with neither
        // dimension that needs rescuing.
        expect(doc).toContain('svg:not([width]):not([height]){width:90%;height:90%}');
        expect(doc).toContain(VIEWBOX_ONLY);
    });

    it('leaves an SVG that states its own size alone', () => {
        const doc = buildSafePreviewDocument('svg', SIZED, 'a chart');

        // The rescue rule cannot match it, so `max-width`/`max-height` still govern and
        // it keeps the size it asked for. Asserted because a blanket `width:90%` would
        // have been the shorter fix and would have stretched every sized SVG.
        expect(doc).toContain('svg{max-width:90%;max-height:90%}');
        expect(doc).toContain('width="320" height="150"');
    });

    it('carries the CSP twice — attribute and meta — for the browsers that ignore one', () => {
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');

        // The document half. The iframe attribute is the card's job; this is the one
        // that actually applies in Firefox and Safari. Compared against the ESCAPED
        // form: the policy lives in an attribute value, so its apostrophes arrive as
        // entities — asserting the raw constant failed, and it was the test that was
        // wrong, not the escaping.
        expect(doc).toContain('http-equiv="Content-Security-Policy"');
        // `&#039;`, not `&#39;` — `escapeAttr`'s own spelling, checked rather than
        // guessed. Two wrong guesses at this assertion is two more than the escaping
        // deserved: the code was right both times.
        expect(doc).toContain(PREVIEW_CSP.replace(/'/g, '&#039;'));
    });

    it('does not sanitize — the sandbox is what makes this safe', () => {
        // Deliberate, and worth pinning: the message sanitizer drops `<svg>` WHOLESALE
        // (it is in DANGEROUS_TAGS, correctly, for content rendered in the page). Running
        // it here would make every SVG artifact unpreviewable. What makes this safe is the
        // CSP plus the sandboxed frame, not a tag filter.
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');
        expect(doc).toContain('<svg');
    });
});

describe('the artifact card’s own layout', () => {
    it('declares what its tab row depends on, so a host rule cannot move it', () => {
        const styles = getSegmentRenderer('artifact')!.getStyles?.() ?? '';

        // Core is light DOM on purpose — no shadow root, no `::part()`, any selector
        // reaches in — and the corollary is that a component must STATE what its layout
        // depends on. An undeclared property has nothing to override it: this library's
        // own docs site had a bare `nav { justify-content: space-between; padding-top:
        // 30px }`, and the card's `<nav class="aparte-art-card__tabs">` inherited it,
        // putting Preview and Code at opposite ends of the card.
        // `flex-end`: the header above puts the artifact's identity on the left and
        // its copy/download buttons on the right, and this keeps every control in one
        // column. The VALUE matters less than the fact that one is declared at all.
        expect(styles).toContain('justify-content: flex-end');
        expect(styles).toMatch(/\.aparte-art-card__tabs\s*\{[^}]*padding:/);
    });
});

describe('the artifact card’s tab order', () => {
    it('puts Code first, because Code is the tab it opens on', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a1', type: 'artifact', artifactType: 'svg', mimeType: 'image/svg+xml',
            content: '<svg viewBox="0 0 8 8"/>', isStreaming: false,
        } as never) as string;

        // The card defaults to `data-tab="code"` because mounting the preview would
        // execute model-authored code with no gesture. A selected tab sitting SECOND
        // read backwards — and DOM order is keyboard order, so the tab a reader reaches
        // first was not the one already showing.
        expect(html).toContain('data-tab="code"');
        expect(html.indexOf('data-tab-target="code"'))
            .toBeLessThan(html.indexOf('data-tab-target="preview"'));
    });
});
