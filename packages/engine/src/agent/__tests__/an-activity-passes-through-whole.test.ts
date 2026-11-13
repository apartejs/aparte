/**
 * An activity is structured progress an agent reports ("3 of 5 sources read"), named by an id
 * and a type, and sent WHOLE each time it changes. The loop does not read it: it forwards
 * `activity` as a run event, in order, and a sub-agent's carries its `agentId` like the rest
 * of what it does.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamChatEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

const activity = (id: string, activityType: string, content: unknown): StreamChatEvent => ({ type: 'activity', id, activityType, content });

describe('an activity passes through the loop whole', () => {
    it('is forwarded in order, between the text around it, with no agent id', async () => {
        const { transportCall } = scripted({
            parent: [[
                activity('a1', 'search-progress', { read: 0, of: 5 }),
                text('Reading. '),
                activity('a1', 'search-progress', { read: 3, of: 5 }),
                done,
            ]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => undefined, emitter, signal: new AbortController().signal,
        });
        expect(events.filter((e) => e.type !== 'run-start' && e.type !== 'run-done')).toEqual([
            { type: 'turn-start' },
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 0, of: 5 } },
            { type: 'text-delta', delta: 'Reading. ' },
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 3, of: 5 } },
            { type: 'text-flush' },
        ]);
    });

    it('carries the sub-agent\'s id when its model reports one', async () => {
        const research: StreamToolHandler = async (_call, signal, run) => {
            const answer = await runSubAgent(run!, { name: 'researcher', request: ask('child') }, signal);
            return { content: answer.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'research'), done], [text('Done.'), done]],
            child: [[activity('a1', 'search-progress', { read: 1, of: 2 }), text('Found it.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => research, emitter, signal: new AbortController().signal,
        });
        const agentId = agentIdOf(events.find((e) => e.type === 'agent-start')!);
        expect(agentId).toEqual(expect.any(String));
        expect(events.filter((e) => e.type === 'activity')).toEqual([
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 1, of: 2 }, agentId },
        ]);
    });

    it('passes on an activity a tool reports through its sub-agent\'s handle', async () => {
        const tool: StreamToolHandler = async (_call, _signal, run) => {
            const agent = run!.startAgent({ name: 'indexer' });
            agent.emit({ type: 'activity', id: 'ix', activityType: 'indexing', content: { files: 12 } });
            agent.end('done', { result: 'ok' });
            return { content: 'ok' };
        };
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'index'), done], [text('Indexed.'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => tool, emitter, signal: new AbortController().signal,
        });
        const agentId = agentIdOf(events.find((e) => e.type === 'agent-start')!);
        expect(events.filter((e) => e.type === 'activity')).toEqual([
            { type: 'activity', id: 'ix', activityType: 'indexing', content: { files: 12 }, agentId },
        ]);
    });
});
