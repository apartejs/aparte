/**
 * `STEP_STARTED` / `STEP_FINISHED` reach the page as `step-start` / `step-end`, attributed
 * to the sub-agent a `subagentRunId` names, as every other attributed event is. They were
 * verified, then dropped. A step still open when the run ends — finished, failed, stopped —
 * is closed then, so nothing is left lit.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

const steps = (events: { type: string }[]) => events.filter((e) => e.type === 'step-start' || e.type === 'step-end');

describe('a step the agent announces reaches the page', () => {
    it('as step-start and step-end, in order with the text around them', async () => {
        const f = scripted(sse(
            started(),
            { type: 'STEP_STARTED', stepName: 'Reading the parser' },
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'It reads tokens.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm' },
            { type: 'STEP_FINISHED', stepName: 'Reading the parser' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'step-start', name: 'Reading the parser' },
            { type: 'text-delta', delta: 'It reads tokens.' },
            { type: 'text-flush' },
            { type: 'step-end', name: 'Reading the parser' },
            { type: 'run-done' },
        ]);
    });

    it('a sub-agent\'s step carries its id, and two of one name are told apart by their owner', async () => {
        const f = scripted(sse(
            started(),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'researcher' },
            { type: 'STEP_STARTED', stepName: 'Searching' },
            { type: 'STEP_STARTED', stepName: 'Searching', subagentRunId: 's1' },
            { type: 'STEP_FINISHED', stepName: 'Searching', subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            { type: 'STEP_FINISHED', stepName: 'Searching' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Searching' },
            { type: 'step-start', name: 'Searching', agentId: 's1' },
            { type: 'step-end', name: 'Searching', agentId: 's1' },
            { type: 'step-end', name: 'Searching' },
        ]);
    });

    it('a sub-agent\'s step still open when it finishes is closed before its end', async () => {
        const f = scripted(sse(
            started(),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'researcher' },
            { type: 'STEP_STARTED', stepName: 'Searching', subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            // The protocol's pairing is by owner and name: the sub-agent's close comes late.
            { type: 'STEP_FINISHED', stepName: 'Searching', subagentRunId: 's1' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'agent-start', 'step-start', 'step-end', 'agent-end', 'run-done']);
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Searching', agentId: 's1' },
            { type: 'step-end', name: 'Searching', agentId: 's1' },
        ]);
    });

    it('a stream that ends with steps open is refused, and they are closed all the same', async () => {
        // A relaxed framing (TanStack AI's) checks what is left open at the end of the stream.
        const f = scripted(sse(
            started(),
            { type: 'STEP_STARTED', stepName: 'Planning' },
            { type: 'STEP_STARTED', stepName: 'Searching', subagentRunId: 's1' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch, { relaxedRunFraming: true }));
        expect(error).toBeInstanceOf(Error);
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Planning' },
            { type: 'step-start', name: 'Searching', agentId: 's1' },
            { type: 'step-end', name: 'Searching', agentId: 's1' },
            { type: 'step-end', name: 'Planning' },
        ]);
    });

    it('a stream refused mid-way closes the steps it left open', async () => {
        // Strict framing refuses a step still running at RUN_FINISHED, inside the stream.
        const f = scripted(sse(
            started(),
            { type: 'STEP_STARTED', stepName: 'Planning' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeInstanceOf(Error);
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Planning' },
            { type: 'step-end', name: 'Planning' },
        ]);
    });

    it('a step still open when the run fails is closed before the failure', async () => {
        const f = scripted(sse(
            started(),
            { type: 'STEP_STARTED', stepName: 'Planning' },
            { type: 'RUN_ERROR', message: 'boom' },
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeInstanceOf(Error);
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Planning' },
            { type: 'step-end', name: 'Planning' },
        ]);
    });

    it('a step still open when the run is stopped is closed', async () => {
        const stop = new AbortController();
        const f = scripted(sse(
            started(),
            { type: 'STEP_STARTED', stepName: 'Planning' },
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'stop here' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm' },
            { type: 'STEP_FINISHED', stepName: 'Planning' },
            finished(),
        ));
        const events: { type: string }[] = [];
        await turn(agUi(f.fetch), {
            signal: stop.signal,
            emitter: (e: { type: string }) => {
                events.push(e);
                if (e.type === 'text-delta') stop.abort();
            },
        } as never);
        expect(steps(events)).toEqual([
            { type: 'step-start', name: 'Planning' },
            { type: 'step-end', name: 'Planning' },
        ]);
    });
});
