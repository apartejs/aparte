/**
 * `setupSubagents`: what it installs, what its disposer takes back, and a second call on the
 * same config replacing the first.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig, createSegmentList, createStreamAdapter, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupSubagents, SUBAGENT_SEGMENT_TYPE } from '../index.js';
import { as, chat } from './harness.js';

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

const carrying: AparteToolCallSegment = {
    id: 'tool-c1', type: 'tool_call', status: 'pending',
    toolCall: { id: 'c1', name: 'delegate', input: {} },
    subagent: { id: 'a1', name: 'Researcher', status: 'running', segments: [] },
} as AparteToolCallSegment;

describe('setupSubagents', () => {
    it('installs one observer, the tool-line provider and the segment renderer, on the global config by default', () => {
        const stop = setupSubagents();
        expect(aparteGlobalConfig.getRunEventObservers()).toHaveLength(1);
        expect(aparteGlobalConfig.getToolLineProvider()!(carrying)).toMatchObject({ label: 'Researcher' });
        expect(getSegmentRenderer(SUBAGENT_SEGMENT_TYPE, aparteGlobalConfig)).toBeDefined();
        stop();
    });

    it('the disposer takes all three back, and the reply is drawn by nobody again', () => {
        const stop = setupSubagents();
        stop();
        expect(aparteGlobalConfig.getRunEventObservers()).toHaveLength(0);
        expect(aparteGlobalConfig.getToolLineProvider()).toBeNull();
        expect(getSegmentRenderer(SUBAGENT_SEGMENT_TYPE, aparteGlobalConfig)).toBeUndefined();
        // Safe to call twice.
        stop();
    });

    it('forgets the replies it follows: a run disposed mid-way is written no more', () => {
        const stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', toolCallId: 'c1' },
        );
        stop();
        const before = JSON.stringify(c.segments());
        const warn = console.warn;
        console.warn = () => {};
        try {
            c.run(...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Nobody hears this.' }));
        } finally {
            console.warn = warn;
        }
        expect(JSON.stringify(c.segments())).toBe(before);
    });

    it('follows a bounded number of replies: the oldest one nobody ended is forgotten', () => {
        const stop = setupSubagents();
        // Each reply is a list an app's adapter writes, with a sub-agent left running.
        const replies = Array.from({ length: 65 }, (_, i) => {
            const list = createSegmentList({ messageId: `m${i}` });
            const emit = createStreamAdapter({ target: list, config: aparteGlobalConfig, messageId: `m${i}` });
            emit({ type: 'agent-start', agentId: `a${i}`, name: 'Worker' });
            return { list, emit };
        });
        const forgotten = replies[0]!;
        const before = JSON.stringify(forgotten.list.segments);
        forgotten.emit({ type: 'turn-start', agentId: 'a0' });
        forgotten.emit({ type: 'text-delta', delta: 'Nobody follows me now.', agentId: 'a0' });
        expect(JSON.stringify(forgotten.list.segments)).toBe(before);
        // The newest is still followed.
        const newest = replies[64]!;
        newest.emit({ type: 'turn-start', agentId: 'a64' });
        newest.emit({ type: 'text-delta', delta: 'Still here.', agentId: 'a64' });
        expect(JSON.stringify(newest.list.segments)).toContain('Still here.');
        stop();
    });

    it('a second call on the same config replaces the first', () => {
        setupSubagents({ counts: true });
        const stop = setupSubagents({ activity: false });
        expect(aparteGlobalConfig.getRunEventObservers()).toHaveLength(1);
        const line = aparteGlobalConfig.getToolLineProvider()!({
            ...carrying,
            subagent: { id: 'a1', name: 'Researcher', status: 'running', segments: [{ id: 'tool-g', type: 'tool_call', status: 'pending', toolCall: { id: 'g', name: 'grep', input: {} } }] },
        } as AparteToolCallSegment);
        expect(line?.activity).toBeUndefined();
        stop();
        expect(aparteGlobalConfig.getRunEventObservers()).toHaveLength(0);
    });

    it('on a config of its own, leaves the global one alone', () => {
        const config = new AparteConfig();
        const stop = setupSubagents({}, config);
        expect(config.getRunEventObservers()).toHaveLength(1);
        expect(aparteGlobalConfig.getRunEventObservers()).toHaveLength(0);
        expect(aparteGlobalConfig.getToolLineProvider()).toBeNull();
        stop();
        expect(config.getRunEventObservers()).toHaveLength(0);
    });

    it("an app's own provider replaced by the setup is not removed by another's disposer", () => {
        const stop = setupSubagents();
        const mine = () => ({ label: 'Mine' });
        aparteGlobalConfig.setToolLineProvider(mine);
        stop();
        expect(aparteGlobalConfig.getToolLineProvider()).toBe(mine);
    });
});
