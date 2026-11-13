/**
 * A sub-agent's text is written once a frame.
 *
 * Every token of a sub-agent rewrites the segment that carries its lane, and that redraws a
 * row: so text and reasoning that only GROW what is there wait for the next frame, and go
 * out together. What changes the shape — a new segment, a tool's state, the end — is
 * written at once. A sub-agent that ends while it reasons leaves nothing streaming.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, createStreamAdapter, type AparteSegment } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, frame, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const lane = (c: ReturnType<typeof chat>) => subagentOf(callIn(c.segments(), 'c1')!)!;

describe("a sub-agent's text", () => {
    it('that only grows waits for the next frame, and goes out in one write', async () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'One' }),
        );
        // The first delta opened a segment: written at once.
        expect(textOfAll(lane(c).segments)).toBe('One');
        const writes = vi.spyOn(c.viewport as unknown as { updateSegment(id: string, updates: object): void }, 'updateSegment');
        c.run(...as('a1',
            { type: 'text-delta', delta: ', two' },
            { type: 'text-delta', delta: ', three' },
            { type: 'thinking-delta', delta: 'hm' },
        ));
        // A reasoning block is a new segment: written at once, with what came before it.
        expect(textOfAll(lane(c).segments)).toBe('One, two, three hm');
        writes.mockClear();
        c.run(...as('a1', { type: 'thinking-delta', delta: 'm' }, { type: 'thinking-delta', delta: 'm' }));
        expect(writes).not.toHaveBeenCalled();
        expect(textOfAll(lane(c).segments)).toBe('One, two, three hm');
        await frame();
        expect(writes.mock.calls.filter(([id]) => id === 'tool-c1')).toHaveLength(1);
        expect(textOfAll(lane(c).segments)).toBe('One, two, three hmmm');
    });

    it('a sub-agent that ends while it reasons leaves nothing streaming', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'thinking-delta', delta: 'Still thinking' }),
        );
        expect(lane(c).segments[0]!.isStreaming).toBe(true);
        c.run({ type: 'agent-end', agentId: 'a1', status: 'stopped' });
        expect(lane(c).segments.every((s: AparteSegment) => s.isStreaming !== true)).toBe(true);
    });

    it('reaches a target the plugin cannot read — an app driving the adapter itself', () => {
        stop = setupSubagents();
        const written: Array<[string, Partial<AparteSegment>]> = [];
        const target = {
            addSegment: () => {},
            updateSegment: (id: string, u: Partial<AparteSegment>) => { written.push([id, u]); },
            updateMessage: () => {},
            dispatchEvent: () => true,
            getMessage: () => { throw new Error('not readable'); },
        };
        const emit = createStreamAdapter({ target, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
        emit({ type: 'agent-start', agentId: 'a1', toolCallId: 'c1' });
        emit({ type: 'turn-start', agentId: 'a1' });
        emit({ type: 'text-delta', delta: 'Heard.', agentId: 'a1' });
        const last = written.filter(([id]) => id === 'tool-c1').at(-1)![1] as { subagent?: { segments: AparteSegment[] } };
        expect(textOfAll(last.subagent!.segments)).toBe('Heard.');
    });
});
