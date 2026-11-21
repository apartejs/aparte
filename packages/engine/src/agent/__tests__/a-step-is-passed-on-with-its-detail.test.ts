/**
 * A step's data is passed on by the loop as it came: `step-start` with its `detail`, and
 * `step-update` with the new one, the reply's own and a sub-agent's (with its `agentId`).
 *
 * The adapter and the bubble were tested past the engine only: a loop that dropped `detail`, or
 * `step-update`, left every label without the words it reads.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamChatEvent, StreamRunEvent } from '../stream-events';
import { ask, done, scripted, toolUse } from './sub-agent-script';

const step = (type: 'step-start' | 'step-update' | 'step-end', detail?: Record<string, unknown>): StreamChatEvent =>
    ({ type, name: 'search', ...(detail ? { detail } : {}) }) as StreamChatEvent;

describe('a step with data, through the loop', () => {
    it('is passed on with its detail, and its update with the new one', async () => {
        const events: StreamRunEvent[] = [];
        const { transportCall } = scripted({ parent: [[step('step-start', { q: 'parser' }), step('step-update', { q: 'lexer' }), step('step-end'), done]] });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, toolLookup: () => undefined,
            emitter: (e) => { events.push(e); }, signal: new AbortController().signal,
        });
        expect(events.filter((e) => e.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'search', detail: { q: 'parser' } },
            { type: 'step-update', name: 'search', detail: { q: 'lexer' } },
            { type: 'step-end', name: 'search' },
        ]);
    });

    it('is passed on as a sub-agent\'s, with its agentId', async () => {
        const events: StreamRunEvent[] = [];
        const { transportCall } = scripted({
            parent: [[toolUse('d1', 'delegate')], [done]],
            child: [[step('step-start', { q: 'parser' }), step('step-update', { q: 'lexer' }), done]],
        });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_c, signal, run) => ({ content: (await runSubAgent(run!, { name: 'Reader', request: ask('child') }, signal)).text }),
            emitter: (e) => { events.push(e); }, signal: new AbortController().signal,
        });
        const agentId = (events.find((e) => e.type === 'agent-start') as { agentId: string }).agentId;
        expect(events.filter((e) => e.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'search', detail: { q: 'parser' }, agentId },
            { type: 'step-update', name: 'search', detail: { q: 'lexer' }, agentId },
        ]);
    });
});
