/**
 * The chat follows the system color scheme by default (#cowork-1).
 *
 * Dark used to exist only behind `[data-aparte-theme="dark"]`: on a dark OS, an
 * aparté chat rendered LIGHT on the host's dark page — unreadable, with no error —
 * unless the host knew to set the attribute. Measured by a consumer building from
 * the docs alone.
 *
 * The contract these tests pin, in three states:
 *   - no attribute        → the system decides (`prefers-color-scheme`),
 *   - data-aparte-theme="dark"  → dark, whatever the OS (unchanged),
 *   - data-aparte-theme="light" → light, whatever the OS (NEW — without it, a host
 *     that wants light-always on a dark OS has no lever at all).
 *
 * jsdom applies no media queries, so the testable surface is the stylesheet itself —
 * the same pattern as the other theme tests. The byte-parity of the two dark blocks
 * and the value-parity of the light block are held by `check:derived-vars` (a guard,
 * because the failure mode is DRIFT between duplicates, which one green run cannot
 * prove forever); here we pin that each piece EXISTS and carries `color-scheme`.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

// The whole corpus, as the browser reads it — the selectors below are unique to
// theme.css (no other sheet declares a palette or a prefers-color-scheme block).
const theme = readAparteStylesheet();

/** The declarations of one block, comments stripped, matched from a selector. */
function blockOf(selectorRe: RegExp): string {
    const m = theme.replace(/\/\*[\s\S]*?\*\//g, '').match(selectorRe);
    return m?.[1] ?? '';
}

describe('the theme follows the system by default', () => {
    it('a prefers-color-scheme: dark media block themes the un-attributed root', () => {
        expect(theme).toMatch(/@media \(prefers-color-scheme: dark\)/);
        // The explicit light choice must beat a dark OS — the guard is in the selector.
        expect(theme).toMatch(/:root:not\(\[data-aparte-theme=(?:"|')?light(?:"|')?\]\)/);
    });

    it('the media block moves the same masters the dark attribute moves', () => {
        // Full byte-parity is check:derived-vars' job; here, the anchor tokens that
        // make a theme readable must be in BOTH dark blocks.
        const attr = blockOf(/\[data-aparte-theme="dark"\]\s*\{([^}]*)\}/);
        const media = blockOf(/@media \(prefers-color-scheme: dark\)[^{]*\{\s*:root:not\(\[data-aparte-theme="light"\]\)\s*\{([^}]*)\}/);
        for (const token of ['--aparte-bg:', '--aparte-text:', '--aparte-surface-1:', '--aparte-primary:', '--aparte-ink-l:']) {
            expect(attr, `attribute block lost ${token}`).toContain(token);
            expect(media, `media block must move ${token} exactly like the attribute does`).toContain(token);
        }
    });

    it('data-aparte-theme="light" exists and re-declares what dark overrides', () => {
        const light = blockOf(/\[data-aparte-theme="light"\]\s*\{([^}]*)\}/);
        expect(light, 'a light-forcing block must exist, or a subtree cannot go light under a dark OS').not.toBe('');
        for (const token of ['--aparte-bg:', '--aparte-text:', '--aparte-surface-1:', '--aparte-primary:']) {
            expect(light, `light block must reset ${token}`).toContain(token);
        }
    });

    it('the explicit gestures declare their color-scheme; the system path does not', () => {
        // `color-scheme` is not namespaced: declared by the MEDIA path on `:root`, a
        // library would flip the host page's native controls — invasive. It rides only
        // the host's explicit gestures, scoped to the subtree the host attributed.
        const attrDark = blockOf(/\[data-aparte-theme="dark"\]\s*\{([^}]*)\}/);
        const light = blockOf(/\[data-aparte-theme="light"\]\s*\{([^}]*)\}/);
        const media = blockOf(/@media \(prefers-color-scheme: dark\)[^{]*\{\s*:root:not\(\[data-aparte-theme="light"\]\)\s*\{([^}]*)\}/);
        expect(attrDark).toMatch(/color-scheme:\s*dark/);
        expect(light).toMatch(/color-scheme:\s*light/);
        expect(media, 'the media path must NOT set color-scheme on the host root').not.toMatch(/color-scheme/);
    });
});
