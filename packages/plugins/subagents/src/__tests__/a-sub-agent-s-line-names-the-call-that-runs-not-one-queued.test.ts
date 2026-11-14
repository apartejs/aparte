/**
 * A sub-agent's line names the call it is running, not one waiting its turn.
 *
 * A sub-agent's step can show a call before it runs: one that waits its place in the step is
 * drawn where the model wrote it, `queued`. The line says what the sub-agent is doing now, so
 * it passes over a queued call for the one that runs; once the queued one goes on, the line
 * names it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteSegment, type AparteToolCallSegment } from '@aparte/core';
import { setupSubagents } from '../index.js';

afterEach(() => aparteGlobalConfig.reset());

const call = (id: string, name: string, extra: Partial<AparteToolCallSegment> = {}): AparteSegment => ({
    id: `tool-${id}`, type: 'tool_call', status: 'pending', toolCall: { id, name, input: {} }, ...extra,
} as AparteSegment);

const carrying = (segments: AparteSegment[]): AparteToolCallSegment => ({
    id: 'tool-t', type: 'tool_call', status: 'pending',
    toolCall: { id: 't', name: 'delegate', input: {} },
    subagent: { id: 'a1', name: 'Worker', status: 'running', segments },
} as AparteToolCallSegment);

describe("a sub-agent's line", () => {
    it('names the call that runs while the one after it is queued', () => {
        const stop = setupSubagents();
        const line = aparteGlobalConfig.getToolLineProvider()!(carrying([call('w1', 'edit_file'), call('w2', 'run_command', { queued: true })]));
        expect(line?.activity).toBe('edit_file');
        stop();
    });

    it('passes over a call left waiting its turn by a pause', () => {
        const stop = setupSubagents();
        const line = aparteGlobalConfig.getToolLineProvider()!(carrying([call('w1', 'edit_file'), call('w2', 'run_command', { deferred: { reason: 'queued' } })]));
        expect(line?.activity).toBe('edit_file');
        stop();
    });

    it('names the queued call once it goes on', () => {
        const stop = setupSubagents();
        const line = aparteGlobalConfig.getToolLineProvider()!(carrying([call('w1', 'edit_file', { status: 'resolved' }), call('w2', 'run_command')]));
        expect(line?.activity).toBe('run_command');
        stop();
    });
});
