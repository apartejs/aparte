/**
 * The sandboxed document an artifact previews inside.
 *
 * It had no test of its own, and the gap showed the moment the landing's SVG payload
 * became a real file rather than a hand-written chart: the frame went blank. Not the
 * content, not the CSP, not the sanitizer — the SIZE. The document centres with
 * `display:flex; align-items:center`, and an SVG carrying only a `viewBox` has no
 * intrinsic dimensions, so as a flex item its cross size collapses to zero.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getSegmentRenderer } from '@aparte/core';
import { buildSafePreviewDocument, PREVIEW_CSP } from '../preview-document.js';
import { setupArtifacts } from '../index.js';
import artifactStyles from '../artifact.css?raw';

beforeAll(() => { setupArtifacts(); });

const VIEWBOX_ONLY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"/></svg>';
const SIZED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" width="320" height="150"><rect width="320" height="150"/></svg>';

describe('the SVG preview document', () => {
    it('gives a viewBox-only SVG a size, because centring collapses it otherwise', () => {
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');
        expect(doc).toContain('svg:not([width]):not([height]){width:90%;height:90%}');
        expect(doc).toContain(VIEWBOX_ONLY);
    });

    it('leaves an SVG that states its own size alone', () => {
        const doc = buildSafePreviewDocument('svg', SIZED, 'a chart');
        expect(doc).toContain('svg{max-width:90%;max-height:90%}');
        expect(doc).toContain('width="320" height="150"');
    });

    it('carries the CSP twice — attribute and meta — for the browsers that ignore one', () => {
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');
        expect(doc).toContain('http-equiv="Content-Security-Policy"');
        // `&#039;` — `escapeAttr`'s own spelling of the apostrophe.
        expect(doc).toContain(PREVIEW_CSP.replace(/'/g, '&#039;'));
    });

    it('does not sanitize — the sandbox is what makes this safe', () => {
        // The message sanitizer drops `<svg>` wholesale (correctly, for content rendered
        // in the page). Running it here would make every SVG artifact unpreviewable.
        const doc = buildSafePreviewDocument('svg', VIEWBOX_ONLY, 'a mark');
        expect(doc).toContain('<svg');
    });
});

describe('the artifact card’s own layout', () => {
    it('declares what its tab row depends on, so a host rule cannot move it', () => {
        // The sheet the renderer injects through `getStyles()`. Core is light DOM on
        // purpose, so a component must STATE what its layout depends on: a docs site's
        // bare `nav { justify-content: space-between }` once moved the card's tabs.
        expect(artifactStyles).toContain('justify-content: flex-end');
        expect(artifactStyles).toMatch(/\.aparte-art-card__tabs\s*\{[^}]*padding:/);
        expect(getSegmentRenderer('artifact')!.getStyles!()).toBe(artifactStyles);
    });

    it('carries its own tokens, so nothing in core has to declare them', () => {
        for (const token of ['--aparte-art-paper-bg', '--aparte-art-file-icon-bg-pdf', '--aparte-art-card-btn-size']) {
            expect(artifactStyles, token).toMatch(new RegExp(`${token}:`));
        }
    });
});

describe('the artifact card’s tab order', () => {
    it('puts Code first, because Code is the tab it opens on', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a1', type: 'artifact', artifactType: 'svg', mimeType: 'image/svg+xml',
            content: '<svg viewBox="0 0 8 8"/>', isStreaming: false,
        } as never) as string;
        expect(html).toContain('data-tab="code"');
        expect(html.indexOf('data-tab-target="code"'))
            .toBeLessThan(html.indexOf('data-tab-target="preview"'));
    });
});

/**
 * The `css` kind wraps the model's body in a `<style>` element, and `<style>` is raw
 * text: the parser ends it on `</style` plus a terminator, whatever the CSS
 * tokenizer thinks. So a stylesheet artifact could close its own wrapper and open a
 * `<script>` — the same break-out `escapeClosingScriptTag` has always closed on the
 * `js` kind, on a kind whose whole promise is that it only styles.
 *
 * The sandbox still holds either way (opaque origin, `PREVIEW_CSP`), so this is the
 * gap between what "preview this stylesheet" promises and what it does, not a
 * containment failure.
 */
describe('the CSS preview document', () => {
    /** The real HTML parser, which is the only one whose opinion counts here. */
    const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html');

    it('cannot be closed early by a body that writes </style>', () => {
        const doc = parse(buildSafePreviewDocument('css', '</style><script>parent.leak=1</script>', 'sheet'));
        expect(doc.querySelector('script')).toBeNull();
        // The text is still there — inert, inside the stylesheet, where it belongs.
        expect(doc.querySelector('style')!.textContent).toContain('parent.leak=1');
    });

    it('catches every spelling the parser ends a raw-text element on', () => {
        for (const body of ['</style >', '</style/', '</STYLE>', '</style>']) {
            const doc = parse(buildSafePreviewDocument('css', `${body}<script>x</script>`, 'sheet'));
            expect(doc.querySelector('script'), body).toBeNull();
        }
        // …including at the very end of the body, with no terminator to follow.
        expect(parse(buildSafePreviewDocument('css', 'a{}</style', 'sheet')).querySelectorAll('style')).toHaveLength(1);
    });

    it('leaves ordinary CSS exactly as written', () => {
        const css = '.demo h1 { color: #b91c1c; content: "a < b"; }';
        expect(buildSafePreviewDocument('css', css, 'sheet')).toContain(css);
    });

    it('leaves a `</styles` that ends nothing alone', () => {
        // The parser only ends the element on `</style` + whitespace / `/` / `>` / EOF,
        // so neither does this — escaping it would corrupt legitimate CSS.
        expect(buildSafePreviewDocument('css', 'a::after{content:"</styles"}', 'sheet'))
            .toContain('content:"</styles"');
    });
});
