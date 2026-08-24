// @vitest-environment jsdom
/**
 * A bubble with nothing to paint does not paint a box.
 *
 * `.aparte-message-content` carries the user bubble's background, padding and radius.
 * The attachment chips render ABOVE it, outside it — so a message that is ONLY
 * attachments left that box with no content, no segments and no waiting dots, and it
 * still drew itself: a coloured rectangle under the chips, reported from the page as
 * "the bubble is there and empty".
 *
 * The box is not simply "hidden when empty", because the assistant's waiting dots live
 * inside it and a fresh streaming bubble is empty by definition. Both halves are here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteAttachment, AparteSegment } from '../../../types/index.js';

interface BubbleEl extends HTMLElement {
    setContent(content: string): void;
    setAttachments(attachments: AparteAttachment[]): void;
    setSegments(segments: AparteSegment[]): void;
}

function mount(role: 'user' | 'assistant'): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', role);
    document.body.appendChild(el);
    return el;
}

const box = (el: HTMLElement): HTMLElement => el.querySelector('.aparte-message-content') as HTMLElement;

afterEach(() => { document.body.innerHTML = ''; });

describe('the painted content box', () => {
    it('is hidden when a user message is only attachments', () => {
        const el = mount('user');
        el.setContent('');
        el.setAttachments([{ id: 'a1', name: 'report.pdf', type: 'application/pdf', size: 12 } as AparteAttachment]);

        // The chips are there — they were never the problem.
        expect(el.querySelector('.aparte-attachments')!.hasAttribute('hidden')).toBe(false);
        // And the box under them is not.
        expect(box(el).hidden).toBe(true);
    });

    it('appears the moment there is text to hold', () => {
        const el = mount('user');
        el.setAttachments([{ id: 'a1', name: 'report.pdf', type: 'application/pdf', size: 12 } as AparteAttachment]);
        el.setContent('');
        expect(box(el).hidden).toBe(true);

        el.setContent('have a look');

        expect(box(el).hidden).toBe(false);
    });

    it('stays for a streaming assistant, because the dots live inside it', () => {
        const el = mount('assistant');
        el.setContent('');
        // `streaming` is an observed ATTRIBUTE, not a method — the same signal a
        // wrapper sets. There is no `setStreaming()`, and assuming one is what this
        // test's first version did.
        el.setAttribute('streaming', '');

        // The other half of the rule: empty is not the test, empty AND not waiting is.
        // Hiding on empty alone would have taken the typing indicator with it.
        expect(el.querySelector('.aparte-waiting')!.hasAttribute('hidden')).toBe(false);
        expect(box(el).hidden).toBe(false);
    });

    it('and for a message whose content is segments rather than text', () => {
        const el = mount('assistant');
        el.setContent('');
        el.setSegments([{ id: 's1', type: 'text', content: 'from a segment' } as AparteSegment]);

        expect(box(el).hidden).toBe(false);
    });
});
