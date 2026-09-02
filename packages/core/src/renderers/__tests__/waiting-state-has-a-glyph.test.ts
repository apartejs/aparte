// @vitest-environment jsdom
/**
 * The tool row's waiting state is a glyph AND a word, like its siblings (UI audit — TA-3).
 *
 * The badge is one vocabulary: Done wears a check, Rejected and Failed a cross, Stopped
 * a square — a glyph and a capitalised word. The state a person is asked to decide on
 * was the odd one out: a lower-case phrase ("waiting for you") and no glyph. The word
 * is now "Waiting"; this holds the glyph — a pause, because that is what the turn is
 * doing: paused for someone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

afterEach(() => { document.body.innerHTML = ''; });

describe('the waiting state', () => {
    it('carries a glyph beside its word, as every other state does', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        document.body.appendChild(el);
        el.setSegments([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 't1', name: 'delete_file', input: { path: 'src/legacy/old-client.ts' } },
        } as AparteSegment]);
        const state = el.querySelector('.aparte-tool-state')!;
        expect(state.textContent?.trim()).toBe('Waiting');
        expect(state.querySelector('svg'), 'the pause glyph').not.toBeNull();
    });
});
