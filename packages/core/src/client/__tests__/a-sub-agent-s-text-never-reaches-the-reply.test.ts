// @vitest-environment jsdom
/**
 * A sub-agent's text, reasoning and tool calls never reach the reply.
 *
 * The events a sub-agent emits carry its `agentId`; the reply is the run's own. Before the
 * adapter routed them away, a sub-agent's words were drawn flat in the parent's bubble and
 * saved as its own, and its `turn-start` reset the parent's parser mid-sentence. With no
 * observer installed, nothing draws them — and the developer is told so, once per config.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStreamAdapter, type AparteStreamRunEvent } from '../stream-adapter.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

function target() {
    const added: AparteSegment[] = [];
    const updates: [string, Partial<AparteSegment>][] = [];
    const messages: [string, Partial<AparteMessage>][] = [];
    const usage: unknown[] = [];
    const events: string[] = [];
    return {
        added, updates, messages, usage, events,
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => { messages.push([id, u]); },
        setUsage: (_id: string, u: unknown) => { usage.push(u); },
        dispatchEvent: (e: Event) => { events.push(e.type); return true; },
    };
}

/** Everything a sub-agent can emit, as the sub-agent `a1` of the call `c1`. */
const childEvents = (agentId: string): AparteStreamRunEvent[] => [
    { type: 'agent-start', agentId, name: 'researcher', description: 'Read the parser', toolCallId: 'c1' },
    { type: 'turn-start', agentId },
    { type: 'thinking-delta', delta: 'Child thinks.', agentId },
    { type: 'text-delta', delta: 'Child speaks.', agentId },
    { type: 'sources', sources: [{ id: 's1', url: 'https://example.com' }], agentId },
    { type: 'tool-start', toolCallId: 'c2', name: 'read_file', input: { path: 'a' }, agentId },
    { type: 'tool-approved', toolCallId: 'c2', agentId },
    { type: 'tool-resolved', toolCallId: 'c2', result: 'contents', agentId },
    { type: 'tool-start', toolCallId: 'c3', name: 'grep', input: {}, agentId },
    { type: 'tool-failed', toolCallId: 'c3', error: 'boom', agentId },
    { type: 'tool-start', toolCallId: 'c4', name: 'grep', input: {}, agentId },
    { type: 'tool-rejected', toolCallId: 'c4', reason: 'no', agentId },
    { type: 'tool-aborted', toolCallId: 'c4', cause: 'stopped', agentId },
    { type: 'turn-limit-exceeded', scope: 'global', limit: 3, agentId },
    { type: 'text-flush', agentId },
    // A hand-written backend could send these; a sub-agent never ends the run.
    { type: 'run-done', agentId } as unknown as AparteStreamRunEvent,
    { type: 'run-aborted', agentId } as unknown as AparteStreamRunEvent,
    { type: 'agent-end', agentId, status: 'done', result: 'Child speaks.' },
];

afterEach(() => vi.restoreAllMocks());

describe('a sub-agent\'s events, with no observer', () => {
    it('add no segment and change nothing on the message', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });

        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'Hello ' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
        for (const e of childEvents('a1')) emit(e);
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'Child speaks.' });
        emit({ type: 'text-delta', delta: 'world' });
        emit({ type: 'text-flush' });
        emit({ type: 'run-done' });

        // The parent's text and its call, nothing else.
        expect(t.added.map((s) => s.type)).toEqual(['text', 'tool_call']);
        expect(t.added.find((s) => s.type === 'tool_call')?.id).toBe('tool-c1');
        const touched = new Set(t.updates.map(([id]) => id));
        for (const id of ['tool-c2', 'tool-c3', 'tool-c4']) expect(touched.has(id)).toBe(false);
        const written = JSON.stringify([t.added, t.updates]);
        expect(written).not.toContain('Child thinks.');
        expect(written).not.toContain('example.com');
        // The parent's sentence was not cut by the child's `turn-start`.
        const text = t.added.find((s) => s.type === 'text')!;
        const last = [...t.updates].reverse().find(([id]) => id === text.id)?.[1] as { content?: string } | undefined;
        expect(last?.content ?? (text as { content: string }).content).toBe('Hello world');
        // The message: streaming once, completed once, by the parent alone.
        expect(t.messages).toEqual([['m1', { status: 'streaming' }], ['m1', { status: 'completed' }]]);
        expect(t.events).not.toContain('aparte-message-aborted');
    });

    it('warn once per config that nothing draws them, naming the plugin', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = new AparteConfig();
        for (const messageId of ['m1', 'm2']) {
            const emit = createStreamAdapter({ target: target(), config, messageId });
            for (const e of childEvents(`a-${messageId}`)) emit(e);
        }
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('@aparte/plugin-subagents');

        // Another chat's config hears it too, once.
        const emit = createStreamAdapter({ target: target(), config: new AparteConfig(), messageId: 'm3' });
        for (const e of childEvents('a3')) emit(e);
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('say nothing for a reply with no sub-agent', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const emit = createStreamAdapter({ target: target(), config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'Hi' });
        emit({ type: 'text-flush' });
        emit({ type: 'run-done' });
        expect(warn).not.toHaveBeenCalled();
    });
});

describe("a pause that waits on a sub-agent's call", () => {
    it("marks no row of the reply for it, only the reply's own calls", () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({
            type: 'run-suspended',
            pending: [
                { toolCallId: 'c9', name: 'write_file', input: {}, reason: 'approval', agentId: 'a1' },
                { toolCallId: 'p1', name: 'delete_file', input: {}, reason: 'approval' },
            ],
        });
        // The sub-agent's call is not a row of the reply: it takes no ticket here.
        expect(t.updates.map(([id]) => id)).toEqual(['tool-p1']);
    });
});
