// @vitest-environment jsdom
/**
 * An empty, settled turn renders no chrome.
 *
 * A turn whose only content was a tool that renders nothing (an `ask_user` with no
 * preamble), or one stopped before its first token, left a name and a timestamp
 * floating over nothing — an orphan "Assistant 03:07" in the transcript, twice in the
 * UI audit's captures. The bubble now flags `.aparte-message` with `data-empty` when it
 * has no content, no segments, no attachments and is not streaming; the stylesheet
 * hides the row. Streaming is never empty (the waiting dots are the content), and
 * attachments are content.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteMessage, AparteAttachment, AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & {
    updateMessage(updates: Partial<AparteMessage>): void;
    setAttachments(attachments: AparteAttachment[]): void;
    setSegments(segments: AparteSegment[]): void;
};

const mount = (streaming: boolean): BubbleEl => {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    if (streaming) el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
};

const row = (el: HTMLElement): HTMLElement => el.querySelector('.aparte-message') as HTMLElement;

afterEach(() => { document.body.innerHTML = ''; });

describe('an empty turn', () => {
    it('keeps its chrome while streaming — the dots are the content', () => {
        const el = mount(true);
        expect(row(el).hasAttribute('data-empty')).toBe(false);
    });

    it('drops its chrome once settled with nothing to show', () => {
        const el = mount(true);
        el.updateMessage({ status: 'completed' });   // stopped before the first token
        expect(row(el).hasAttribute('data-empty')).toBe(true);
    });

    it('is not empty once a segment arrives, nor when it only carries attachments', () => {
        const el = mount(false);
        expect(row(el).hasAttribute('data-empty')).toBe(true);
        el.setSegments([{ id: 's1', type: 'text', content: 'hello' }]);
        expect(row(el).hasAttribute('data-empty')).toBe(false);

        const only = mount(false);
        only.setAttribute('data-role', 'user');
        only.setAttachments([{ id: 'f', name: 'brief.pdf', type: 'application/pdf', url: '#' }]);
        expect(row(only).hasAttribute('data-empty')).toBe(false);
    });
});
