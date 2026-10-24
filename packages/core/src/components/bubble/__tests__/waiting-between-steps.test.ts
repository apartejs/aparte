// @vitest-environment jsdom
/**
 * The waiting dots come back between two steps of a turn.
 *
 * They showed only until the first segment arrived. After a tool row read "Done", the
 * reply sat still while the model worked on its next turn — nothing said anything was
 * coming, and a long agent turn looked frozen. The dots now also show while the reply
 * streams and its last segment is a call that has finished (or that the app hides),
 * and leave as soon as the next step writes. A call waiting for a person shows no dots:
 * nothing is coming until they answer.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteSegment, AparteToolCallSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & {
    addSegment(segment: AparteSegment): void;
    updateSegment(id: string, updates: Partial<AparteSegment>): void;
};

function streamingBubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const dots = (el: HTMLElement) => !el.querySelector<HTMLElement>('.aparte-waiting')!.hidden;
const call = (status: AparteToolCallSegment['status'], name = 'read_file'): AparteToolCallSegment =>
    ({ id: 'tool-c1', type: 'tool_call', status, toolCall: { id: 'c1', name, input: {} } } as AparteToolCallSegment);

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('between two steps', () => {
    it('no dots while a call runs — its row has its own spinner', () => {
        const el = streamingBubble();
        el.addSegment(call('pending'));
        expect(dots(el)).toBe(false);
    });

    it('dots once the call is done and the next step has not written yet', () => {
        const el = streamingBubble();
        el.addSegment(call('pending'));
        el.updateSegment('tool-c1', { status: 'resolved', result: 'ok' } as Partial<AparteSegment>);
        expect(dots(el)).toBe(true);
    });

    it('gone as soon as the next step writes', () => {
        const el = streamingBubble();
        el.addSegment(call('resolved'));
        el.addSegment({ id: 't1', type: 'text', content: 'The file says…' } as AparteSegment);
        expect(dots(el)).toBe(false);
    });

    it('none while a person is being asked: nothing comes until they answer', () => {
        const el = streamingBubble();
        el.addSegment(call('awaiting-approval'));
        expect(dots(el)).toBe(false);
    });

    it('dots while a hidden call runs — the reader sees nothing else working', () => {
        aparteGlobalConfig.registerToolDisplay('internal_log', { hidden: true });
        const el = streamingBubble();
        el.addSegment(call('pending', 'internal_log'));
        expect(dots(el)).toBe(true);
    });
});
