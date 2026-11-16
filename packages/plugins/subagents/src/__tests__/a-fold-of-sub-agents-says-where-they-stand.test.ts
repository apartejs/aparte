/**
 * A fold of sub-agents says where they stand: `subagentsTurnLabel`, handed to core's turn
 * summary, writes the fold's line as their number and how many are in each state — "3
 * sub-agents · 1 done, 2 running" — and keeps it up to date as they work. With fewer than two
 * the fold keeps core's line.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteSegment } from '@aparte/core';
import { setupSubagents, subagentsTurnLabel } from '../index.js';
import { chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const foldLine = (host: HTMLElement): string | null =>
    host.querySelector('.aparte-turn > summary > .aparte-turn__label')?.textContent ?? null;

/** Three calls, each opening a sub-agent. */
const three = [
    { type: 'run-start' },
    { type: 'turn-start' },
    { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
    { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a2', name: 'Tester', toolCallId: 'c2' },
    { type: 'tool-start', toolCallId: 'c3', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a3', name: 'Writer', toolCallId: 'c3' },
] as const;

describe('a fold of sub-agents', () => {
    it('counts them by state, and follows them as they end', () => {
        aparteGlobalConfig.setTurnSummary({ label: subagentsTurnLabel });
        stop = setupSubagents();
        const c = chat();
        c.run(...three);
        expect(foldLine(c.host)).toBe('3 sub-agents · 3 running');

        c.run(
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
        );
        expect(foldLine(c.host)).toBe('3 sub-agents · 1 done, 2 running');
    });

    it("says it in the chat's language, with its plural forms", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        aparteGlobalConfig.setTurnSummary({ label: subagentsTurnLabel });
        stop = setupSubagents();
        const c = chat();
        c.run(...three,
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'agent-end', agentId: 'a2', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c2', result: 'ok' },
        );
        expect(foldLine(c.host)).toBe('3 sous-agents · 2 terminés, 1 en cours');
    });

    it('leaves the line to core under two sub-agents, and for steps that are not sub-agents', () => {
        const step = (id: string): AparteSegment => ({ id, type: 'tool_call', status: 'pending', toolCall: { id, name: 'read_file', input: {} } } as AparteSegment);
        const context = { running: true, config: aparteGlobalConfig };
        expect(subagentsTurnLabel([step('x'), step('y')], context)).toBeUndefined();
        expect(subagentsTurnLabel([
            { ...step('z'), subagent: { id: 'a1', status: 'running', segments: [] } } as AparteSegment,
            step('y'),
        ], context)).toBeUndefined();
    });
});
