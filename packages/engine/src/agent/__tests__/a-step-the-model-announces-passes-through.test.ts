/**
 * A step is a name with a start and an end ("Reading the parser"), announced by whoever runs
 * the agent: a model call's stream, a runner, a sub-agent. The loop does not interpret it — it
 * forwards `step-start` / `step-end` as run events, in order, and a sub-agent's carry its
 * `agentId` like the rest of what it does.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamChatEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

const stepStart = (name: string): StreamChatEvent => ({ type: 'step-start', name });
const stepEnd = (name: string): StreamChatEvent => ({ type: 'step-end', name });

describe('a step the model announces passes through the loop', () => {
    it('is forwarded in order, between the text around it, with no agent id', async () => {
        const { transportCall } = scripted({
            parent: [[stepStart('Reading the parser'), text('It reads '), stepStart('Checking tokens'), stepEnd('Checking tokens'), text('tokens.'), stepEnd('Reading the parser'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => undefined, emitter, signal: new AbortController().signal,
        });
        expect(events.filter((e) => e.type !== 'run-start' && e.type !== 'run-done')).toEqual([
            { type: 'turn-start' },
            { type: 'step-start', name: 'Reading the parser' },
            { type: 'text-delta', delta: 'It reads ' },
            { type: 'step-start', name: 'Checking tokens' },
            { type: 'step-end', name: 'Checking tokens' },
            { type: 'text-delta', delta: 'tokens.' },
            { type: 'step-end', name: 'Reading the parser' },
            { type: 'text-flush' },
        ]);
    });

    it('carries the sub-agent\'s id when its model announces it', async () => {
        const research: StreamToolHandler = async (_call, signal, run) => {
            const answer = await runSubAgent(run!, { name: 'researcher', request: ask('child') }, signal);
            return { content: answer.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'research'), done], [text('Done.'), done]],
            child: [[stepStart('Searching'), text('Found it.'), stepEnd('Searching'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => research, emitter, signal: new AbortController().signal,
        });
        const agentId = agentIdOf(events.find((e) => e.type === 'agent-start')!);
        expect(agentId).toEqual(expect.any(String));
        const steps = events.filter((e) => e.type === 'step-start' || e.type === 'step-end');
        expect(steps).toEqual([
            { type: 'step-start', name: 'Searching', agentId },
            { type: 'step-end', name: 'Searching', agentId },
        ]);
    });

    it('passes on a step a tool announces through its sub-agent\'s handle', async () => {
        const tool: StreamToolHandler = async (_call, _signal, run) => {
            const agent = run!.startAgent({ name: 'indexer' });
            agent.emit({ type: 'step-start', name: 'Indexing' });
            agent.emit({ type: 'step-end', name: 'Indexing' });
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
        expect(events.filter((e) => e.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'Indexing', agentId },
            { type: 'step-end', name: 'Indexing', agentId },
        ]);
    });
});
