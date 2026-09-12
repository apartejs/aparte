/**
 * The preview paper stays the paper, and the dark override reaches a system-dark reader
 * (the CSS/a11y audit, 2026-09-05 — m10, m11).
 *
 * Two defects, one cause: this sheet was read by no guard in the repo.
 * `scripts/check-derived-vars.mjs` reads `coreStylesheets()`, which is the import block
 * of `packages/core/src/index.ts`, so the only plugin stylesheet in the tree was outside
 * the prefix rule, the single-owner rule, the dead-keyframe rule and "a documented
 * @cssprop has a reader" alike.
 *
 * m11 — `.aparte-art-file__preview-pane` forces the light paper on purpose (an artifact
 * preview is a DOCUMENT shown inside the chat, the way a PDF viewer shows a white page
 * in a dark editor), and the empty-state line inside it then reached back into the theme
 * for `--aparte-text-muted`. In the dark theme that is `#a89bb6`, on `#fff`: relative
 * luminance 0.3515 against 1.0, i.e. **2.62:1** — under 4.5 and under 3. The pane needs
 * its own muted ink, mixed from the two paper tokens so a consumer who re-declares the
 * paper moves it too. `.aparte-art-file__error-hint` was checked and is NOT the same
 * case: it sits on `--aparte-error-bg`, where the same colour measures 6.14:1.
 *
 * m10 — the sheet's one dark rule was `[data-aparte-theme="dark"] .aparte-segment-artifact-file`
 * with no `prefers-color-scheme` sibling, so a system-dark reader who sets no attribute
 * kept the LIGHT wash (`rgba(0,0,0,0.04)`) on the already-dark `--aparte-error-bg`.
 * core's `theme.css` carries the same duplication for the same reason; `check:derived-vars`
 * holds those two byte-identical, and this suite is that guard's stand-in here.
 *
 * The third assertion is a live bug the same sweep found: `--aparte-error-title` left
 * core with the error renderer's private classes, and this sheet went on reading it with
 * no fallback — invalid at computed-value time, so the heading quietly took the panel's
 * body ink instead of the error ink.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The sheet, from either working directory (repo root, or the package). */
function sheet(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/plugins/artifacts', '.']) {
            const p = join(dir, root, 'src', 'artifact.css');
            try {
                return readFileSync(p, 'utf8');
            } catch { /* keep walking */ }
        }
    }
    throw new Error(`artifact.css not found from ${process.cwd()}`);
}

const css = sheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

const rule = (selector: string): string => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the paper keeps its own ink', () => {
    it('read the corpus', () => {
        expect(css.length).toBeGreaterThan(3000);
    });

    it('declares a muted ink beside the other paper tokens, derived from them', () => {
        const paper = rule('.aparte-segment-artifact-file');
        expect(paper).toBeTruthy();
        expect(paper).toMatch(
            /--aparte-art-paper-text-muted:\s*color-mix\(in srgb,\s*var\(--aparte-art-paper-text\)[^;]*var\(--aparte-art-paper-bg\)\)/,
        );
    });

    it('reads it on the empty preview line, not the theme’s muted text', () => {
        const empty = rule('.aparte-art-file__preview-empty');
        expect(empty).toBeTruthy();
        expect(empty).toMatch(/color:\s*var\(--aparte-art-paper-text-muted\)/);
        expect(empty).not.toContain('--aparte-text-muted');
    });

    it('names no token core no longer declares', () => {
        expect(css).not.toContain('--aparte-error-title');
    });
});

describe('the dark override', () => {
    const DECL = '--aparte-art-file-error-msg-bg: rgba(255, 255, 255, 0.06)';

    it('rides the attribute', () => {
        expect(rule('[data-aparte-theme="dark"] .aparte-segment-artifact-file')).toContain(DECL);
    });

    it('and the system default, with the same value', () => {
        expect(rule(':root:not([data-aparte-theme="light"]) .aparte-segment-artifact-file')).toContain(DECL);
        expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    });

    it('has no third copy the two would drift from', () => {
        expect([...css.matchAll(/--aparte-art-file-error-msg-bg:\s*rgba\(255/g)].length).toBe(2);
    });
});
