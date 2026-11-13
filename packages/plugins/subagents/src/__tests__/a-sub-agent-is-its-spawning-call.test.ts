/**
 * A sub-agent is the call that opened it.
 *
 * The reply shows one row for the call — no second line, no child text in the reply — and
 * the sub-agent's whole conversation is kept on that call's segment, in `subagent`: what the
 * conversation saves, and what a detail view draws later.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus } from '../index.js';
import { as, callIn, chat, shown, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('a sub-agent is its spawning call', () => {
    it('one row for the call, the lane on it, the child text nowhere in the reply', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Let me delegate.' },
            { type: 'text-flush' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: { task: 'read' } },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
            ...as('a1',
                { type: 'turn-start' },
                { type: 'thinking-delta', delta: 'Child thinks.' },
                { type: 'text-delta', delta: 'Child speaks.' },
                { type: 'tool-start', toolCallId: 'c2', name: 'read_file', input: { path: 'parser.ts' } },
                { type: 'tool-resolved', toolCallId: 'c2', result: 'contents' },
                { type: 'turn-start' },
                { type: 'text-delta', delta: 'Child concludes.' },
                { type: 'text-flush' },
            ),
            { type: 'agent-end', agentId: 'a1', status: 'done', result: 'Child concludes.' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'The parser is fine.' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'All good.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        );

        // The reply: its text, its one call, its text.
        expect(c.segments().map((s) => s.type)).toEqual(['text', 'tool_call', 'text']);
        expect(textOfAll(c.segments())).not.toMatch(/Child/);

        // The lane, on the call.
        const call = callIn(c.segments(), 'c1')!;
        const sub = subagentOf(call)!;
        expect(sub).toMatchObject({ id: 'a1', name: 'Researcher', description: 'Read the parser', status: 'done', result: 'Child concludes.' });
        expect(sub.segments.map((s) => s.type)).toEqual(['thinking', 'text', 'tool_call', 'text']);
        expect(textOfAll(sub.segments)).toContain('Child speaks.');
        expect(callIn(sub.segments, 'c2')).toMatchObject({ status: 'resolved', messageId: 'a1' });
        // Stamped like a message's: numbered from 0 in its own list.
        expect(sub.segments.map((s) => s.index)).toEqual([0, 1, 2, 3]);
        expect(subagentStatus(call)).toBe('done');

        // On screen: one row, named by the sub-agent; none of its words in the bubble.
        expect(c.host.querySelectorAll('.aparte-segment-tool-call')).toHaveLength(1);
        const row = c.row('tool-c1');
        expect(shown(row, 'name')).toBe('Researcher');
        expect(shown(row, 'target')).toBe('Read the parser');
        expect(c.host.textContent).not.toMatch(/Child/);
        // The line alone: nothing behind it.
        expect(row!.tagName).not.toBe('DETAILS');
    });

    it('without the plugin the call is an ordinary row, and the lane is kept nowhere', () => {
        const warn = console.warn;
        console.warn = () => {};
        try {
            const c = chat();
            c.run(
                { type: 'run-start' },
                { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
                { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
                ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Child speaks.' }, { type: 'text-flush' }),
                { type: 'agent-end', agentId: 'a1', status: 'done' },
                { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
                { type: 'run-done' },
            );
            const call = callIn(c.segments(), 'c1')!;
            expect(subagentOf(call)).toBeUndefined();
            expect(shown(c.row('tool-c1'), 'name')).toBe('delegate');
        } finally {
            console.warn = warn;
        }
    });
});
