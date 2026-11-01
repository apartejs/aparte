/**
 * A select in the composer sits on the composer's surface, not the page's.
 *
 * The select paints `--aparte-select-bg`, which falls back to `--aparte-surface-1`; the
 * composer's shell paints `--aparte-input-bg`. Core's theme makes the two equal, so nothing
 * showed — until a skin gave the composer a colour of its own (the examples' dark skin:
 * #303030 on a #212121 page) and the approval switch in the toolbar kept the page's, a darker
 * patch inside the composer. The shell hands its colour to the selects inside it, by
 * declaration: a select outside the composer, and one whose host sets the token closer to
 * it, are untouched.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const composer = strip(readFileSync(resolve(coreRoot(), 'src/styles/components/composer.css'), 'utf8'));

describe('a select in the composer', () => {
    it('takes the background the shell paints', () => {
        expect(composer).toMatch(/\.aparte-composer-shell\s*\{[^}]*--aparte-select-bg:\s*var\(--aparte-input-bg\)/);
    });
});
