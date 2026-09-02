// @vitest-environment jsdom
/**
 * The bubble's attachment tiles wear the thumbnail recipe.
 *
 * `aparte-thumbnail` is the recipe — the square, its size, its ground — and
 * `aparte-thumb` only maps the attachment strip's measurements onto it. The composer's
 * preview tiles carried both; the bubble's sent-message tiles carried the mapping
 * alone, so they had no box: a bare "PDF" beside a bare image, caught on a screenshot.
 * The same rule the charter states for every control — a component wears the recipe,
 * it does not redraw it — and it cannot wear one it does not name.
 *
 * The parts wear it too (UI audit LOT 4). The sheet drew the image and the label twice,
 * under two vocabularies: `aparte-thumbnail__image` / `__label` — the recipe, the one
 * the kit page teaches — and `aparte-thumb__img` / `__ext`, the only ones the bubble and
 * the composer emitted. So the documented parts had no emitter, the emitted ones had a
 * second, bolder recipe, and a tile on the kit page did not look like a tile in a chat.
 * One vocabulary survives: the recipe's.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../aparte-chat-bubble.js';
import type { AparteAttachment } from '../../../types/index.js';
import { coreRoot } from '../../../__tests__/read-stylesheet.js';

type BubbleEl = HTMLElement & { setAttachments(attachments: AparteAttachment[]): void };

const thumbnail = readFileSync(resolve(coreRoot(), 'src/styles/display/thumbnail.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

afterEach(() => { document.body.innerHTML = ''; });

describe('sent attachments', () => {
    it('render as thumbnail-recipe tiles, image and file alike', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'user');
        el.setAttribute('message-id', 'u1');
        document.body.appendChild(el);
        el.setAttachments([
            { id: 'i', name: 'moodboard.png', type: 'image/png', url: 'data:image/png;base64,AAA=' },
            { id: 'f', name: 'brief.pdf', type: 'application/pdf', url: '#' },
        ]);

        const tiles = el.querySelectorAll('.aparte-attachments .aparte-thumbnail.aparte-thumb');
        expect(tiles).toHaveLength(2);
        expect(tiles[0]!.classList.contains('aparte-thumb--image')).toBe(true);
        expect(tiles[1]!.classList.contains('aparte-thumb--file')).toBe(true);
        expect(tiles[0]!.querySelector('img.aparte-thumbnail__image')).toBeTruthy();
        expect(tiles[1]!.querySelector('.aparte-thumbnail__label')?.textContent).toBe('PDF');
    });

    it('the sheet draws the parts once, under the recipe names', () => {
        expect(thumbnail).toMatch(/\.aparte-thumbnail__image\s*\{/);
        expect(thumbnail).toMatch(/\.aparte-thumbnail__label\s*\{/);
        expect(thumbnail).not.toMatch(/\.aparte-thumb__img\b/);
        expect(thumbnail).not.toMatch(/\.aparte-thumb__ext\b/);
        expect(thumbnail).not.toMatch(/aparte-thumbnail__ext/);
    });
});
