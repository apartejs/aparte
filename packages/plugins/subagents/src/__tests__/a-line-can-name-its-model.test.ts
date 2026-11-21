/**
 * `setupSubagents({ model: true })`: a sub-agent's line names the model it runs on, quietly.
 *
 * A host running a sub-agent on another model than its conversation put the model in the name
 * ("Reader · qwen3:8b"), the one field the line drew. `agent-start` now carries `model`, kept on
 * the segment so a thread read back still says it. Off by default: every existing line would
 * change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { callIn, chat, frame, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const events = [
    { type: 'run-start' },
    { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1', model: 'qwen3:8b' },
] as const;

describe('a sub-agent\'s model', () => {
    it('is kept on its segment, and drawn on its line with model: true', async () => {
        stop = setupSubagents({ model: true });
        const c = chat();
        c.run(...events);
        await frame();
        expect(subagentOf(callIn(c.segments(), 'c1')!)!.model).toBe('qwen3:8b');
        expect(shown(c.row('tool-c1'), 'note') ?? '').toContain('qwen3:8b');
        expect(shown(c.row('tool-c1'), 'name')).toBe('Reader');
    });

    it('is not drawn by default', async () => {
        stop = setupSubagents();
        const c = chat();
        c.run(...events);
        await frame();
        expect(shown(c.row('tool-c1'), 'note') ?? '').not.toContain('qwen3:8b');
    });
});
