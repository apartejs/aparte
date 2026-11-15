// @vitest-environment jsdom
/**
 * A sub-agent's pause survives a reload.
 *
 * An AG-UI agent pauses on a call its sub-agent made (an interrupt tagged with the
 * sub-agent's run). The call has no row in the reply — the sub-agent's line draws it — so
 * nothing in the saved reply said a call was waiting: after a reload, `resumeDeferred` found
 * no paused call and the turn stayed stuck, the agent waiting on an interrupt nobody would
 * answer. The reply now keeps the sub-agent's paused call (`AparteMessage.deferredCalls`):
 * the reload asks again, under the sub-agent's name, and the agent resumes with the answer.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteClient, AparteConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { adoptMessageSegments } from '../../../../../core/src/utils/segments.js';
import { agUi, finished, scripted, sse, started } from './replay.js';

vi.mock('@aparte/core', async () => await import('../../../../../core/src/index.js'));

/** A chat target that keeps what it is told, the way a viewport does. */
function chat(initial: AparteMessage[] = []) {
    // What a load does to a stored message: its segments are adopted as historical data.
    const messages: AparteMessage[] = structuredClone(initial).map((m) => adoptMessageSegments(m));
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
        getMessage: (id: string) => messages.find((m) => m.id === id),
    });
    document.body.appendChild(el);
    return { el, messages };
}

/** The agent pauses on `delete_file`, which its sub-agent `cleaner` called. */
const pausing = () => sse(
    started('r1', 'conv'),
    { type: 'TOOL_CALL_START', toolCallId: 'spawn', toolCallName: 'delegate' },
    { type: 'TOOL_CALL_END', toolCallId: 'spawn' },
    { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'cleaner', parentToolCallId: 'spawn' },
    { type: 'TOOL_CALL_START', toolCallId: 'd1', toolCallName: 'delete_file', subagentRunId: 's1' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'd1', delta: '{"path":"/x"}' },
    { type: 'TOOL_CALL_END', toolCallId: 'd1' },
    { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', outcome: { type: 'suspended', interruptIds: ['i1'] } },
    finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'tool_call', toolCallId: 'd1', subagentRunId: 's1' }] } }, 'r1', 'conv'),
);

const resuming = () => sse(
    started('r2', 'conv'),
    { type: 'TOOL_CALL_RESULT', messageId: 'r', toolCallId: 'd1', content: 'deleted' },
    { type: 'TOOL_CALL_RESULT', messageId: 'rs', toolCallId: 'spawn', content: 'Deleted /x.' },
    { type: 'TEXT_MESSAGE_START', messageId: 'p', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'p', delta: 'Done.' },
    { type: 'TEXT_MESSAGE_END', messageId: 'p' },
    finished({}, 'r2', 'conv'),
);

describe('a sub-agent’s pause survives a reload', () => {
    it('is asked again under the sub-agent’s name, and the agent resumes with the answer', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const f = scripted(pausing(), resuming());

        // The first page: the turn pauses, and the conversation is saved as it is then.
        const first = chat();
        let saved: AparteMessage[] = [];
        first.el.addEventListener('aparte-message-paused', () => { saved = structuredClone(first.messages); });
        const before = new AparteClient({
            config: new AparteConfig(), autoRegister: false, targetResolver: () => first.el,
            streamRunner: agUi(f.fetch, { threadId: 'conv' }),
            // Nobody answers on the first page: the person reloads instead.
            approvalResolver: (_call, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('stopped'), { name: 'AbortError' })))),
        });
        const c = before as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
        c._beginUserTurn();
        const sending = c._handleSend(new CustomEvent('aparte-send', { detail: { content: 'tidy up' } }));
        await vi.waitFor(() => expect(saved.length).toBeGreaterThan(0));
        before.stop();
        await sending;

        // The reload: the saved conversation, a new client.
        const second = chat(saved);
        const asked: unknown[] = [];
        const after = new AparteClient({
            config: new AparteConfig(), autoRegister: false, targetResolver: () => second.el,
            streamRunner: agUi(f.fetch, { threadId: 'conv' }),
            approvalResolver: async (call) => { asked.push(call); return { approved: true }; },
        });

        expect(await after.resumeDeferred(second.el)).toBe(true);
        expect(asked).toEqual([{ id: 'd1', name: 'delete_file', input: { path: '/x' }, agent: { id: 's1', name: 'cleaner' } }]);
        expect(f.bodies[1]).toMatchObject({ resume: [{ interruptId: 'i1', status: 'resolved', payload: { approved: true } }] });
        // The call that opened the sub-agent waits on the same pause: the resume hands it back
        // open, not answered "stopped" as a call a load found running would be.
        const sent = (f.bodies[1] as { messages: { role: string; toolCallId?: string; toolCalls?: { id: string }[] }[] }).messages;
        expect(sent.some((m) => m.toolCalls?.some((c) => c.id === 'spawn'))).toBe(true);
        expect(sent.filter((m) => m.role === 'tool' && m.toolCallId === 'spawn')).toEqual([]);
        const reply = second.messages.find((m) => m.role === 'assistant')!;
        expect(reply.status).toBe('completed');
        expect(reply.deferredCalls).toBeUndefined();
        expect(reply.segments?.find((s) => s.type === 'tool_call')).toMatchObject({ status: 'resolved', result: 'Deleted /x.' });
    });
});
