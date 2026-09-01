/**
 * The field family's knobs are declared in theme.css, on `:root` (UI audit LOT 1).
 *
 * `--aparte-field-radius` was declared on `.aparte-field` itself (field.css) and read
 * by `.aparte-field-group` — its PARENT — and by `.aparte-color`, a sibling recipe. A
 * custom property only inherits downwards, so both readers resolved it to nothing and
 * `border-radius` computed to 0: every field group in the library rendered square
 * (the sidebar's search, the `https://` prefix group). The same declaration site made
 * 13 more field knobs unreachable from `:root`, where every other family's knobs live
 * and where the theming guide tells a consumer to override them.
 *
 * Channels stay local on purpose: `--aparte-*-intent`, `--aparte-derived-ink`,
 * `--aparte-switch-track` are filled by modifiers, not set by a theme; and
 * `--aparte-switch-thumb-size` is derived from the switch's own tokens on the switch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const theme = readFileSync(resolve(STYLES, 'theme.css'), 'utf8');
const field = readFileSync(resolve(STYLES, 'field.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const KNOBS = [
    '--aparte-field-padding',
    '--aparte-field-padding-sm',
    '--aparte-field-padding-lg',
    '--aparte-field-radius',
    '--aparte-field-textarea-min-height',
    '--aparte-checkbox-size',
    '--aparte-radio-size',
    '--aparte-radio-dot-size',
    '--aparte-switch-width',
    '--aparte-switch-height',
    '--aparte-switch-thumb-inset',
    '--aparte-range-thumb-size',
    '--aparte-range-track-height',
];

/**
 * theme.css declares on two root-anchored blocks: the literal palette (`:root, :host`)
 * and the derived layer (`:root, :host, [data-aparte-theme], …`). A literal size goes
 * in the first, a knob that reads another token in the second — the split the button
 * already makes. Both are reachable from every reader, which is the point.
 */
const themeDeclarations = theme.replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('field knobs live in theme.css, on :root', () => {
    it.each(KNOBS)('%s is declared in theme.css', (knob) => {
        expect(themeDeclarations, `${knob} must be a theme.css knob, or a parent/sibling reader cannot see it`)
            .toMatch(new RegExp(`^\\s*${knob}\\s*:`, 'm'));
    });

    it.each(KNOBS)('%s is no longer declared inside field.css', (knob) => {
        expect(field, `${knob} declared in field.css shadows the :root knob and can hide it from readers outside its subtree`)
            .not.toMatch(new RegExp(`^\\s*${knob}\\s*:`, 'm'));
    });

    it('the readers that broke read the :root knob: field-group and color take the field radius', () => {
        expect(field).toMatch(/\.aparte-field-group\s*\{[^}]*border-radius:\s*var\(--aparte-field-radius\)/);
        expect(field).toMatch(/\.aparte-color\s*\{[^}]*var\(--aparte-field-radius\)/);
    });
});
