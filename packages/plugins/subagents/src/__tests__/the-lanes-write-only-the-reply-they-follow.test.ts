/**
 * The lanes write only the reply they follow, and only while its run is on.
 *
 * Three guards of the lanes, each with a case only it decides:
 * - a target that cannot dispatch DOM events never says the reply paused, so `run-suspended`,
 *   as the observers hear it, is the one moment the lanes are written before a save;
 * - a late event for a reply whose run ended opens nothing for it;
 * - a target that writes "the segment with this id" wherever it lives is never handed a
 *   write for a segment the reply does not hold: it would land on another reply.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    AparteConfig,
    aparteGlobalConfig,
    createStreamAdapter,
    type AparteMessage,
    type AparteSegment,
    type StreamAdapterTarget,
} from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/**
 * A chat that is no element: it holds messages, adds a segment to the LAST one and updates a
 * segment wherever it is, and dispatches nothing.
 */
function plainTarget(messages: AparteMessage[]): StreamAdapterTarget & { getMessage(id: string): AparteMessage | undefined } {
    const holder = (id: string) => [...messages].reverse().find((m) => m.segments?.some((s) => s.id === id));
    return {
        getMessage: (id) => messages.find((m) => m.id === id),
        addSegment: (segment) => { const m = messages.at(-1)!; m.segments = [...(m.segments ?? []), segment]; },
        updateSegment: (id, updates) => {
            const m = holder(id);
            if (m) m.segments = m.segments!.map((s) => (s.id === id ? { ...s, ...updates } as AparteSegment : s));
        },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
}

const reply = (id: string): AparteMessage => ({ id, role: 'assistant', content: '', timestamp: 1, segments: [] } as AparteMessage);

describe('the lanes', () => {
    it('are written when the run pauses, on a target that cannot say the reply paused', () => {
        const config = new AparteConfig();
        stop = setupSubagents({}, config);
        const messages = [reply('a1')];
        const emit = createStreamAdapter({ target: plainTarget(messages), config, messageId: 'a1' });
        for (const e of [
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'x1', name: 'Writer', toolCallId: 'c1' },
            // The first delta opens a segment, written at once; the second waits for a frame.
            ...as('x1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Still ' }, { type: 'text-delta', delta: 'going.' }),
            { type: 'run-suspended', pending: [] },
        ] as Parameters<typeof emit>[0][]) emit(e);

        // At once, no frame waited for: what a save on this event would keep.
        expect(textOfAll(subagentOf(callIn(messages[0]!.segments!, 'c1')!)!.segments)).toBe('Still going.');
    });

    it('open nothing for a reply whose run ended', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'x1', name: 'Planner' },
            ...as('x1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planned.' }),
            { type: 'agent-end', agentId: 'x1', status: 'done' },
            { type: 'run-done' },
        );
        const before = JSON.stringify(c.segments());
        // A late sub-agent of the same reply, after its end: nobody follows it any more.
        c.run(
            { type: 'agent-start', agentId: 'x2', name: 'Latecomer' },
            ...as('x2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Too late.' }),
        );
        expect(JSON.stringify(c.segments())).toBe(before);
        expect(c.segments().filter((s) => s.type === 'subagent')).toHaveLength(1);
    });

    it("never write a segment the reply does not hold, though another reply holds it", () => {
        const config = new AparteConfig();
        stop = setupSubagents({}, config);
        // The reply a1 is not the last message: what the target adds lands on a2.
        const messages = [reply('a1'), reply('a2')];
        const emit = createStreamAdapter({ target: plainTarget(messages), config, messageId: 'a1' });
        for (const e of [
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'x1', name: 'Planner' },
            ...as('x1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Not yours.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'x1', status: 'done' },
            { type: 'run-done' },
        ] as Parameters<typeof emit>[0][]) emit(e);

        // The segment the plugin added went to a2, by the target's doing; a2 is not written.
        const elsewhere = messages[1]!.segments!.find((s) => s.id === 'subagent-x1')!;
        expect(subagentOf(elsewhere)).toMatchObject({ status: 'running', segments: [] });
        expect(messages[0]!.segments).toEqual([]);
    });
});
