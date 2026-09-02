/**
 * The action bar's ink starts where the text starts (UI audit — LOT 22).
 *
 * The most reproducible defect of the whole audit: in 14 previews the first action
 * button's GLYPH began 5 to 8px right of the paragraph above it. The bar's box was
 * aligned to the column; the glyph inside a 24px box is centred, so its ink sits half
 * the slack — (24 − 12) / 2 — to the right. The bar takes that slack back as a negative
 * start margin, computed from the two tokens the small icon button is made of, so the
 * ink meets the column and the box overhangs into the message padding, where nothing
 * else lives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const bubble = readFileSync(resolve(coreRoot(), 'src/styles/components/bubble.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const bar = bubble.match(/(?:^|\n)\.aparte-action-bar\s*\{([^}]*)\}/)?.[1] ?? '';

describe('the action bar', () => {
    it('pulls its first glyph back onto the text column', () => {
        expect(bar).toMatch(/margin-inline-start:\s*calc\(\s*\(\s*var\(--aparte-icon-size-sm\)\s*-\s*var\(--aparte-btn-size-sm\)\s*\)\s*\/\s*2\s*\)/);
    });
});
