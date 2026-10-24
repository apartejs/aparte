// @vitest-environment jsdom
/**
 * A streamed reasoning block says it is arriving, and stops saying it when the model moves on.
 *
 * The adapter created the block with no `isStreaming` and only ever wrote `false`, when the
 * answer began. So the one flag a renderer reads for "still arriving" — the label's
 * shimmer — was never true on the live path, and a block that a tool call followed kept
 * reading "Thinking" while the tool ran, until text came. The block arrives `true`, and
 * settles at the answer's first token or at the first tool call, whichever comes first.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';

function target() {
    const added: AparteSegment[] = [];
    const updates: [string, Partial<AparteSegment>][] = [];
    return {
        added, updates,
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
}

function start(t: ReturnType<typeof target>) {
    const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    emit({ type: 'thinking-delta', delta: 'Let me look it up.' });
    return emit;
}

afterEach(() => aparteGlobalConfig.clearSegmentDefaults('thinking'));

describe('a streamed reasoning block', () => {
    it('arrives with isStreaming: true', () => {
        const t = target();
        start(t);
        expect(t.added[0]).toMatchObject({ type: 'thinking', isStreaming: true });
    });

    it('settles when the model calls a tool, before any answer text', () => {
        const t = target();
        const emit = start(t);
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'web_search', input: { query: 'lake' } });
        const id = t.added[0]!.id;
        expect(t.updates).toContainEqual([id, { collapsed: true, isStreaming: false }]);
    });

    it('settles once: the answer that follows the tool does not settle it again', () => {
        const t = target();
        const emit = start(t);
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'web_search', input: { query: 'lake' } });
        emit({ type: 'text-delta', delta: 'Here is what I found.' });
        const id = t.added[0]!.id;
        expect(t.updates.filter(([sid, u]) => sid === id && 'isStreaming' in u)).toHaveLength(1);
    });
});
