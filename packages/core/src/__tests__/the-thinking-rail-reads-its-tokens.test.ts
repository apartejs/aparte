import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

/**
 * `--aparte-thinking-bg` and `--aparte-thinking-content-bg` are declared and read.
 *
 * Both were declared in `theme.css` and read by nothing: the reasoning block hard-coded
 * `background: transparent` on the rail and on the panel, so a theme that set either one
 * changed nothing on screen. The ChatGPT specimen theme under `apps/examples/_shared`
 * sets both — the clearest evidence they read as knobs.
 *
 * The wiring keeps the look byte-identical: the defaults in `theme.css` become
 * `transparent`, which is exactly what the two rules used to hard-code.
 *
 * The panel's token is declared where the panel is drawn: `prose.css` is the only sheet
 * that paints `.aparte-thinking-content`, so it reads the token itself. It used to
 * hard-code `transparent` there and a SECOND rule in `segment/thinking.css` out-specified
 * it with two classes to win the cascade — which also out-specified the consumer, whose
 * own one-class `.aparte-thinking-content { background: … }` silently stopped working
 * (core is light DOM: that override is the escape hatch). One reader, one specificity,
 * per CLAUDE.md's "declare the recipe's token, don't out-specify the recipe".
 */
describe('the reasoning block reads its background tokens', () => {
    /** Comments stripped first: a rule quoted in one would otherwise count as a rule. */
    const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');

    it('paints the rail from --aparte-thinking-bg', () => {
        expect(css).toMatch(/\.aparte-segment-thinking\s*\{[^}]*background:\s*var\(--aparte-thinking-bg\)/);
    });

    it('paints the panel from --aparte-thinking-content-bg, on ONE class', () => {
        expect(css).toMatch(
            /(?:^|[,}])\s*\.aparte-thinking-content\s*\{[^}]*background:\s*var\(--aparte-thinking-content-bg\)/,
        );
    });

    it("leaves the panel reachable from a consumer's own one-class rule", () => {
        // Nothing may out-specify the recipe here: a two-class rule wins over the
        // one-class override a consumer writes, and their sheet stops working with no
        // error and nothing on screen to explain it.
        expect(css).not.toMatch(/\.aparte-segment-thinking\s+\.aparte-thinking-content\s*\{/);
    });

    it('defaults both to transparent, so nothing on screen moves', () => {
        expect(css).toMatch(/--aparte-thinking-bg:\s*transparent;/);
        expect(css).toMatch(/--aparte-thinking-content-bg:\s*transparent;/);
    });
});
