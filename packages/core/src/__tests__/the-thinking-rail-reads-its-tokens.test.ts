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
 * The panel's rule is written with two classes on purpose. `prose.css` also declares a
 * `background` on `.aparte-thinking-content` and is imported LAST, so a single-class
 * rule here would lose the cascade and the token would be declared, "read", and still
 * dead — the failure this file exists to prevent.
 */
describe('the reasoning block reads its background tokens', () => {
    /** Comments stripped first: a rule quoted in one would otherwise count as a rule. */
    const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');

    it('paints the rail from --aparte-thinking-bg', () => {
        expect(css).toMatch(/\.aparte-segment-thinking\s*\{[^}]*background:\s*var\(--aparte-thinking-bg\)/);
    });

    it('paints the panel from --aparte-thinking-content-bg, and wins the cascade', () => {
        expect(css).toMatch(
            /\.aparte-segment-thinking\s+\.aparte-thinking-content\s*\{[^}]*background:\s*var\(--aparte-thinking-content-bg\)/,
        );
    });

    it('defaults both to transparent, so nothing on screen moves', () => {
        expect(css).toMatch(/--aparte-thinking-bg:\s*transparent;/);
        expect(css).toMatch(/--aparte-thinking-content-bg:\s*transparent;/);
    });
});
