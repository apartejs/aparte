/**
 * The avatar's initials, corner and overlap scale with its size (UI audit — LOT 33).
 *
 * One cause, four symptoms, all confirmed: the initials of the 40px avatar were exactly
 * the size of the 32px one's (an 11px cap height in both), the radius was an absolute
 * 9px for the whole ramp so the corner drifted from squircle to square as the box grew,
 * the group's overlap was an absolute 6px (19 % of a 32px avatar, 11 % of a 56px one)
 * behind a 1px ring that read as a strip of soldered keys, and the assistant avatar
 * paired a surface with the INVERSE text colour. What has to follow the ramp is a
 * fraction of `--aparte-avatar-size`, computed on the element so a size modifier moves
 * it; the fractions are the theme's knobs (`--aparte-avatar-initials-ratio`,
 * `--aparte-avatar-radius-ratio`, `--aparte-avatar-overlap-ratio`) in place of the three
 * absolute tokens.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const avatar = strip(readFileSync(resolve(STYLES, 'display/avatar.css'), 'utf8'));
const theme = strip(readFileSync(resolve(STYLES, 'theme.css'), 'utf8'));
const rule = (css: string, selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the avatar ramp', () => {
    it('computes initials and corner from its own size, on the element', () => {
        const base = rule(avatar, '.aparte-avatar');
        expect(base).toMatch(/font-size:\s*calc\(var\(--aparte-avatar-size\)\s*\*\s*var\(--aparte-avatar-initials-ratio\)\)/);
        expect(base).toMatch(/border-radius:\s*calc\(var\(--aparte-avatar-size\)\s*\*\s*var\(--aparte-avatar-radius-ratio\)\)/);
    });

    it('the size modifiers move the size alone', () => {
        for (const mod of ['--xs', '--sm', '--lg', '--xl']) {
            expect(rule(avatar, `.aparte-avatar${mod}`), mod).not.toMatch(/--aparte-avatar-font-size/);
        }
    });

    it('the group overlaps by a fraction of the size, behind a 2px ring', () => {
        expect(rule(avatar, '.aparte-avatar-group > .aparte-avatar:not(:first-child)'))
            .toMatch(/margin-inline-start:\s*calc\(var\(--aparte-avatar-size\)\s*\*\s*var\(--aparte-avatar-overlap-ratio\)\s*\*\s*-1\)/);
        expect(theme).toMatch(/--aparte-avatar-group-ring-width:\s*calc\(var\(--aparte-border-width\)\s*\*\s*2\)/);
    });

    it('the ratios are the theme’s knobs, and the absolute tokens are gone', () => {
        expect(theme).toMatch(/--aparte-avatar-initials-ratio:\s*0\.\d+/);
        expect(theme).toMatch(/--aparte-avatar-radius-ratio:\s*0\.\d+/);
        expect(theme).toMatch(/--aparte-avatar-overlap-ratio:\s*0\.\d+/);
        expect(theme).not.toMatch(/--aparte-avatar-font-size\s*:/);
        expect(theme).not.toMatch(/--aparte-avatar-radius\s*:/);
        expect(theme).not.toMatch(/--aparte-avatar-group-overlap\s*:/);
    });

    it('the assistant avatar’s text is the text colour, on its surface', () => {
        expect(theme).toMatch(/--aparte-avatar-text-assistant:\s*var\(--aparte-text\)/);
    });
});
