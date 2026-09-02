/**
 * The overlaid composer is seen to float (UI audit, visual half — LOT 29).
 *
 * Under `overlay-composer` the bottom stack is raised over the transcript's scroll
 * surface with a `z-index` — and nothing else. Its shell shares the transcript's
 * ground, so on every capture it sat flat on the words it was covering: a thing that
 * floats has to be seen floating. The shell takes an elevation of its own, from a
 * theme token with a light and a dark value.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const shell = strip(readFileSync(resolve(STYLES, 'components/shell.css'), 'utf8'));
const theme = strip(readFileSync(resolve(STYLES, 'theme.css'), 'utf8'));

describe('the overlay composer', () => {
    it('gives its shell an elevation', () => {
        expect(shell).toMatch(/aparte-chat\[overlay-composer\]\s+\.aparte-composer-shell[^{]*\{[^}]*box-shadow:\s*var\(--aparte-composer-overlay-shadow\)/);
    });

    it('from a token declared for both schemes', () => {
        // Light, dark, and the light veto block that restates the palette: at least two
        // values, and one of them under the dark theme.
        const declarations = theme.match(/--aparte-composer-overlay-shadow\s*:/g) ?? [];
        expect(declarations.length).toBeGreaterThanOrEqual(2);
        const dark = theme.slice(theme.indexOf('[data-aparte-theme="dark"]'));
        expect(dark).toMatch(/--aparte-composer-overlay-shadow\s*:/);
    });
});
