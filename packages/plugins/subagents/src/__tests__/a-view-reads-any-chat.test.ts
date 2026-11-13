/**
 * A view reads any chat it is given.
 *
 * The `chat` property takes an element or a plain object with `getMessages()` (a store of
 * the app's own); a reader that throws costs the view its drawing, not the page. A chat
 * that cannot be read at all still shows a live sub-agent, from the plugin's writes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    AparteConfig,
    aparteGlobalConfig,
    createSegmentList,
    createStreamAdapter,
    runWithConfig,
    type AparteMessage,
    type AparteToolCallSegment,
} from '@aparte/core';
import { setupSubagents, subagentTranscript, type AparteSubagentView } from '../index.js';
import { watchLaneWrites } from '../lanes.js';
import { frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const saved: AparteMessage = {
    id: 'm1', role: 'assistant', content: '', timestamp: 1, status: 'completed',
    segments: [{
        id: 'subagent-x', type: 'subagent',
        subagent: { id: 'x', name: 'Planner', description: 'Plan it', status: 'done', segments: [{ id: 't1', type: 'text', content: 'From a store.' }] },
    }],
} as AparteMessage;

function mount(attrs: Record<string, string>): AparteSubagentView {
    const view = document.createElement('aparte-subagent-view');
    for (const [name, value] of Object.entries(attrs)) view.setAttribute(name, value);
    document.body.append(view);
    return view;
}

describe('a view and its chat', () => {
    it("reads a plain object's messages, set after it is on the page", () => {
        const view = mount({ 'message-id': 'm1', 'agent-id': 'x' });
        expect(view.hasAttribute('data-empty')).toBe(true);
        view.chat = { getMessages: () => [saved] };
        expect(view.textContent).toContain('From a store.');
        expect(view.querySelector('.aparte-subagent-task')!.textContent).toBe('Plan it');
    });

    it('draws nothing from a reader that throws', () => {
        const view = mount({ 'message-id': 'm1', 'agent-id': 'x' });
        view.chat = { getMessages: () => { throw new Error('store offline'); } };
        expect(view.textContent).toBe('');
    });

    it('shows a live sub-agent of a chat it cannot read, from the writes', async () => {
        stop = setupSubagents();
        const list = createSegmentList({ messageId: 'm1' });
        const view = mount({ 'message-id': 'm1', 'agent-id': 'x' });
        view.chat = list;
        const emit = createStreamAdapter({ target: list, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'agent-start', agentId: 'x', name: 'Planner' });
        emit({ type: 'turn-start', agentId: 'x' });
        emit({ type: 'text-delta', delta: 'Live words.', agentId: 'x' });
        await frame();
        expect(view.textContent).toContain('Live words.');
        // Another reply's writes, or another agent's, are not its own.
        const other = createStreamAdapter({ target: list, config: aparteGlobalConfig, messageId: 'm2' });
        other({ type: 'agent-start', agentId: 'x', name: 'Other' });
        other({ type: 'turn-start', agentId: 'x' });
        other({ type: 'text-delta', delta: 'Not mine.', agentId: 'x' });
        await frame();
        expect(view.textContent).not.toContain('Not mine.');
        view.refresh();
        expect(view.textContent).toContain('Live words.');
    });

    it('a view that throws while hearing a write costs the others nothing', async () => {
        stop = setupSubagents();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const heard: string[] = [];
        const offs = [watchLaneWrites(() => { throw new Error('bad view'); }), watchLaneWrites((w) => heard.push(w.agentId))];
        try {
            const list = createSegmentList({ messageId: 'm1' });
            const emit = createStreamAdapter({ target: list, config: aparteGlobalConfig, messageId: 'm1' });
            emit({ type: 'agent-start', agentId: 'x' });
            expect(heard).toContain('x');
            expect(error).toHaveBeenCalled();
        } finally {
            for (const off of offs) off();
        }
    });
});

describe('the transcripts kept for the lines', () => {
    it('forgets the oldest a page never showed, past a bound', () => {
        const config = new AparteConfig();
        const call = (i: number): AparteToolCallSegment => ({
            id: `tool-${i}`, type: 'tool_call', messageId: 'm1', status: 'pending',
            toolCall: { id: String(i), name: 'delegate', input: {} },
            subagent: { id: `a${i}`, description: 'Work', status: 'running', segments: [] },
        } as unknown as AparteToolCallSegment);
        runWithConfig(config, () => {
            const first = subagentTranscript(call(0));
            expect(subagentTranscript(call(0))).toBe(first);
            for (let i = 1; i <= 500; i++) subagentTranscript(call(i));
            expect(subagentTranscript(call(0))).not.toBe(first);
        });
    });
});
