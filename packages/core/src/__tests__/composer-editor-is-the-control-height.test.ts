/**
 * The composer's editor is the control height at rest (Paul, 2026-09-02, from a screenshot).
 *
 * Measured on the built preview at 768: the send button is 36px (the composer's control
 * size, the lg step at rest), the editor beside it 44px — 10px of padding, a 24.3px line,
 * 10px of padding — and the row aligns its items at the end, so the button sat 4px below
 * the editor's centre and read as "posed low", the input as "too tall". Both were true.
 *
 * The editor's block padding is derived: half of what remains of the control size once
 * one line of its own text is taken out. At rest the editor is then exactly the control
 * height, whatever the font, and on a coarse pointer it grows to 44 with the buttons; when
 * the text wraps, the editor grows and the end-aligned buttons follow its last line, which
 * is the one behaviour `flex-end` was there for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const theme = strip(readFileSync(resolve(coreRoot(), 'src/styles/theme.css'), 'utf8'));
const composer = strip(readFileSync(resolve(coreRoot(), 'src/styles/components/composer.css'), 'utf8'));

describe('the composer editor at rest', () => {
    it('pads its block axis by half of the control size minus one line of its text', () => {
        expect(theme).toMatch(/--aparte-input-padding-y:\s*calc\(\(var\(--aparte-composer-control-size\)\s*-\s*1lh\)\s*\/\s*2\)/);
    });

    it('keeps the control size as its minimum, so a shorter line never makes it shorter than the buttons', () => {
        const editor = composer.match(/aparte-composer-input \.aparte-ci-editor\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(editor).toMatch(/min-height:\s*var\(--aparte-composer-control-size\)/);
        expect(editor).toMatch(/padding:\s*var\(--aparte-input-padding-y\)\s+var\(--aparte-input-padding-x\)/);
    });
});
