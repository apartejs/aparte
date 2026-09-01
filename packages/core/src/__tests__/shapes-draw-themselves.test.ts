/**
 * A shape that has to be seen draws itself (UI audit — LOT 20, the code half).
 *
 * The lot is the one closest to the palette, so the wording matters: no colour is judged
 * here, a form is found missing. A track nobody sees cannot say "60 %"; a user bubble
 * at 1.03:1 is the only mark that says "this turn is yours" and it was not there; a
 * scrim declared once at `:root` darkened a dark page by 8/255, so the modal state
 * vanished in the dark theme; the scroll rail's resting ticks sat at 1.15:1 and its
 * current tick asked for 22.4px in a 20px rail. Structural, every one: a token doing two
 * jobs, a value written once for two grounds, a rail narrower than what it holds.
 *
 * Decided: `--aparte-track` — the ground of a gauge or a placeholder, derived RELATIVE to
 * the page (so light and dark sit at the same distance from it, which SK-01 measured
 * they did not); the user bubble's tint is the mark's tint; the scrim has a dark value;
 * the rail is as wide as its widest tick and its ticks rest in the control-edge colour.
 * The values are first settings — the names are the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const rule = (css: string, selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};
const theme = read('theme.css');

describe('the track', () => {
    it('is one token, derived relative to the page', () => {
        expect(theme).toMatch(/--aparte-track:\s*color-mix\(in srgb,\s*var\(--aparte-text\)\s*\d+%,\s*var\(--aparte-bg\)\)/);
    });
    it('is what the skeleton and the progress bar rest on', () => {
        expect(theme).toMatch(/--aparte-skeleton-base:\s*var\(--aparte-track\)/);
        expect(rule(read('display/progress.css'), '.aparte-progress')).toMatch(/background:\s*var\(--aparte-track\)/);
    });
});

describe('the skeleton', () => {
    it('does not shorten a one-line skeleton', () => {
        expect(read('display/skeleton.css')).toMatch(/\.aparte-skeleton--text:last-child:not\(:first-child\)/);
    });
});

describe('the user bubble', () => {
    it('is tinted like every other mark', () => {
        expect(theme).toMatch(/--aparte-message-content-bg-user:\s*color-mix\(in srgb,\s*var\(--aparte-primary\)\s*var\(--aparte-mark-tint\)/);
    });
});

describe('the scrim', () => {
    it('has a value for each ground', () => {
        // Block starts at line start: the media block's own guard mentions the light
        // attribute, so a bare indexOf would cut inside it.
        const at = (re: RegExp) => theme.search(re);
        const mediaStart = at(/^@media \(prefers-color-scheme: dark\)/m);
        const vetoStart = at(/^\[data-aparte-theme="light"\]/m);
        const darkStart = at(/^\[data-aparte-theme="dark"\]/m);
        expect(mediaStart).toBeGreaterThan(0);
        expect(vetoStart).toBeGreaterThan(mediaStart);
        expect(darkStart).toBeGreaterThan(vetoStart);
        const light = theme.slice(0, mediaStart);
        const darkMedia = theme.slice(mediaStart, vetoStart);
        const darkAttr = theme.slice(darkStart);
        expect(light).toMatch(/--aparte-scrim:\s*rgba\(0,\s*0,\s*0,\s*0\.35\)/);
        expect(darkMedia).toMatch(/--aparte-scrim:\s*rgba\(0,\s*0,\s*0,\s*0\.6\)/);
        expect(darkAttr).toMatch(/--aparte-scrim:\s*rgba\(0,\s*0,\s*0,\s*0\.6\)/);
    });
});

describe('the scroll rail', () => {
    it('is as wide as its widest tick', () => {
        expect(theme).toMatch(/--aparte-scroll-rail-width:\s*calc\(var\(--aparte-scroll-rail-tick-size\)\s*\*\s*1\.6\)/);
    });
    it('rests its ticks in the control-edge colour', () => {
        expect(rule(read('components/scroll-rail.css'), '.aparte-scroll-rail__tick')).toMatch(/background:\s*var\(--aparte-border-control\)/);
    });
});
