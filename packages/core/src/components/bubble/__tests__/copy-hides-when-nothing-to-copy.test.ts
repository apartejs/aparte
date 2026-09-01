// @vitest-environment jsdom
/**
 * A turn with nothing to copy shows no copy button (UI audit, visual half — LOT 15).
 *
 * The action bar pushed `copy` unconditionally, and the text it assembles is `''` for a
 * turn that holds only a tool call: the button copied the empty string and then said
 * "Copied". The header already refuses to paint a name and a time for an empty turn —
 * the same guard, applied to the one action whose meaning depends on there being text.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

afterEach(() => { document.body.innerHTML = ''; });

function mount(segments: AparteSegment[]): BubbleEl {
    const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
    bubble.setAttribute('data-role', 'assistant');
    bubble.setAttribute('message-id', 'a1');
    document.body.appendChild(bubble);
    bubble.setSegments(segments);
    return bubble;
}

const toolCall: AparteSegment = {
    id: 'tc', type: 'tool_call', toolCallId: 'c1', name: 'search', input: { q: 'x' }, status: 'success', result: 'ok',
} as AparteSegment;

const copyButton = (bubble: HTMLElement) => bubble.querySelector('.aparte-action-copy') as HTMLButtonElement | null;

describe('the copy action', () => {
    it('is hidden on a tool-only turn', () => {
        const bubble = mount([toolCall]);
        expect(copyButton(bubble)?.hidden ?? true).toBe(true);
    });

    it('is hidden when the only text is reasoning, which copy leaves out', () => {
        const bubble = mount([{ id: 't', type: 'thinking', content: 'weighing', label: 'Thinking' }]);
        expect(copyButton(bubble)?.hidden ?? true).toBe(true);
    });

    it('shows once the turn has text — replaced, appended, or streamed into an empty segment', () => {
        const bubble = mount([toolCall]);
        bubble.setSegments([toolCall, { id: 'x', type: 'text', content: 'The answer.' }]);
        expect(copyButton(bubble)?.hidden).toBe(false);

        const streamed = mount([{ id: 's', type: 'text', content: '' }]);
        expect(copyButton(streamed)?.hidden ?? true).toBe(true);
        (streamed as unknown as { appendToSegment(id: string, text: string): void }).appendToSegment('s', 'Hel');
        expect(copyButton(streamed)?.hidden).toBe(false);
    });

    it('shows on plain content', () => {
        const bubble = document.createElement('aparte-chat-bubble') as BubbleEl & { setContent(c: string): void };
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'a2');
        document.body.appendChild(bubble);
        expect(copyButton(bubble)?.hidden ?? true).toBe(true);
        bubble.setContent('Plain.');
        expect(copyButton(bubble)?.hidden).toBe(false);
    });
});
