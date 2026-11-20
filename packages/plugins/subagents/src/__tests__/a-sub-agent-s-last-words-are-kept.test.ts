/**
 * A sub-agent's last words are kept in its transcript, with or without `text-flush`.
 *
 * Its lane's parser holds a delta that ends on a backtick until more arrives. A server that
 * sends no `text-flush` before `agent-end` lost that text from the transcript
 * (apartejs/aparte#275); the run's end without the sub-agent's own end did the same.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const opened = [
    { type: 'run-start' as const },
    { type: 'tool-start' as const, toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start' as const, agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
];

describe("a sub-agent's last words", () => {
    it('ending on inline code, then agent-end with no text-flush: kept', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(...opened, ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'The value is `42`' }),
            { type: 'agent-end', agentId: 'a1', status: 'done', result: 'The value is `42`' });
        expect(textOfAll(subagentOf(callIn(c.segments(), 'c1')!)!.segments)).toBe('The value is `42`');
    });

    it('the run ending under it, with no end of its own: kept', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(...opened, ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Reading `a.ts`' }),
            { type: 'run-done' });
        expect(textOfAll(subagentOf(callIn(c.segments(), 'c1')!)!.segments)).toBe('Reading `a.ts`');
    });
});
