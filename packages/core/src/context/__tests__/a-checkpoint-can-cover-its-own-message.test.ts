// @vitest-environment jsdom
/**
 * A checkpoint can cover the message that carries it: `contextSummary.includesSelf`.
 *
 * A checkpoint reads "from this message on, the summary stands for everything before", so the
 * message carrying it is read and sent. A host that summarised EVERYTHING so far (the last
 * answer too, because keeping it would save nothing) had only the last answer to put the
 * checkpoint on, and that answer stayed counted: the gauge read about full right after a
 * compaction that had freed most of the window, and the history after it still carried the
 * answer the summary already stood for. With `includesSelf`, the history starts AFTER it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { historyFromCheckpoint } from '../checkpoint.js';
import { measureContext } from '../measure.js';
import { applyRetention } from '../../conversations/conversation-manager.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage } from '../../types/index.js';
import '../../components/bubble/aparte-chat-bubble.js';

const msg = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${id} `.repeat(role === 'assistant' ? 400 : 4), timestamp: 1, ...extra,
});
const covering = (summary: string, count: number) => ({ contextSummary: { summary, count, createdAt: 10, includesSelf: true } });
const ids = (path: AparteMessage[]) => path.map((m) => m.id);

describe('a checkpoint that covers its own message', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('starts the history after it, the summary standing for it too', () => {
        const out = historyFromCheckpoint([
            msg('u1', 'user'), msg('a1', 'assistant', covering('S', 2)), msg('u2', 'user'),
        ]);
        expect(out.summary).toBe('S');
        expect(ids(out.messages)).toEqual(['u2']);
    });

    it('on the last message, leaves nothing of the path but the summary', () => {
        const out = historyFromCheckpoint([msg('u1', 'user'), msg('a1', 'assistant', covering('S', 2))]);
        expect(out).toEqual({ summary: 'S', messages: [] });
    });

    it('never covers the question being answered: on a last user message it reads as an ordinary checkpoint', () => {
        const out = historyFromCheckpoint([msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user', covering('S', 2))]);
        expect(ids(out.messages)).toEqual(['u2']);
    });

    it('frees the gauge of the answer it covers', () => {
        const config = new AparteConfig();
        const answer = msg('a1', 'assistant');
        const before = measureContext({ config, messages: [msg('u1', 'user'), { ...answer, contextSummary: { summary: 'S', count: 1, createdAt: 10 } }] });
        const after = measureContext({ config, messages: [msg('u1', 'user'), { ...answer, ...covering('S', 2) }] });
        expect(before.parts.messages).toBeGreaterThan(300);
        expect(after.parts.messages).toBe(0);
        expect(after.parts.summary).toBe(before.parts.summary);
    });

    it('handed down by retention, it no longer covers the message that inherits it', () => {
        const messages = [
            msg('u1', 'user'), msg('a1', 'assistant', covering('S', 2)),
            msg('u2', 'user'), msg('a2', 'assistant'), msg('u3', 'user'),
        ];
        const { messages: kept } = applyRetention(messages, undefined, 2);
        expect(ids(kept)).toEqual(['a2', 'u3']);
        // u1 and a1 were summarised; u2 is lost to the cut and counted with them.
        expect(kept[0]!.contextSummary).toEqual({ summary: 'S', count: 3, createdAt: 10 });
    });

    it('draws its separator under the message, not above it', async () => {
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & { setContextSummary(s: unknown): void };
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'a1');
        document.body.appendChild(bubble);
        await vi.waitFor(() => expect(bubble.querySelector('.aparte-message')).toBeTruthy());

        bubble.setContextSummary({ summary: 'S', count: 2, createdAt: 10, includesSelf: true });
        expect(bubble.lastElementChild?.classList.contains('aparte-checkpoint')).toBe(true);

        bubble.setContextSummary({ summary: 'S', count: 2, createdAt: 10 });
        expect(bubble.firstElementChild?.classList.contains('aparte-checkpoint')).toBe(true);
        expect(bubble.querySelectorAll(':scope > .aparte-checkpoint')).toHaveLength(1);
    });
});
