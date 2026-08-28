// @vitest-environment jsdom
/**
 * Copy copies the reply, not the reasoning.
 *
 * The action joined the `content` of EVERY segment, so a reply that opened with a
 * reasoning block pasted the model's deliberation above the answer — while the
 * client already keeps `thinking` out of the history it sends back, for the same
 * reason (`_segmentsToText`). Two rules for "what the reply is" is how they drift;
 * this pins the bubble's to the client's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('the copy action', () => {
    it('leaves the thinking segment out and keeps everything else', () => {
        const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'a1');
        document.body.appendChild(bubble);
        bubble.setSegments([
            { id: 't', type: 'thinking', content: 'weighing the options', label: 'Thinking' },
            { id: 'x', type: 'text', content: 'The answer.' },
            { id: 'c', type: 'code', language: 'ts', content: 'const a = 1;' },
        ]);

        (bubble.querySelector('.aparte-action-copy') as HTMLButtonElement).click();

        expect(writeText).toHaveBeenCalledTimes(1);
        const copied = writeText.mock.calls[0]![0] as string;
        expect(copied).toBe('The answer.\nconst a = 1;');
        expect(copied).not.toContain('weighing the options');
    });
});
