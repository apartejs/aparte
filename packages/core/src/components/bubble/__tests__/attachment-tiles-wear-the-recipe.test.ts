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
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteAttachment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setAttachments(attachments: AparteAttachment[]): void };

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
        expect(tiles[1]!.querySelector('.aparte-thumb__ext')?.textContent).toBe('PDF');
    });
});
