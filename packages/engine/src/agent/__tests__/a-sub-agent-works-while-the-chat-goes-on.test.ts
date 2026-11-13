/**
 * A sub-agent works while the chat goes on.
 *
 * `runSubAgent` holds its tool call until the sub-agent is back, so the model waits too: the
 * reply stops at the delegation and goes on once every sub-agent has answered. A sub-agent
 * started with `startSubAgent` works in the background instead: its call answers at once, the
 * model goes on writing (and calling its own tools) while the sub-agent works, and the run does
 * not end before it is back. When the model has nothing more to say, the run waits for the
 * sub-agents still at work, tells the model what they answered, and asks it again: that is the
 * reply's last part. A Stop, a pause of the run, a crash or the turn limit end them with it.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { startSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

/** A tool that hands a job to a sub-agent in the background, and answers at once. */
const delegate: StreamToolHandler = async (_call, _signal, run) => {
    const { agentId } = startSubAgent(run!, { name: 'scout', description: 'Look it up', request: ask('child') });
    return { content: `Started ${agentId}.` };
};

const last = (events: StreamRunEvent[], match: (e: StreamRunEvent) => boolean): number => {
    for (let i = events.length - 1; i >= 0; i--) if (match(events[i]!)) return i;
    return -1;
};

describe('a sub-agent in the background', () => {
    it('answers its call at once, and the model writes on while the sub-agent works', async () => {
        const { transportCall } = scripted({
            parent: [
                [toolUse('c1', 'delegate'), done],
                // The model's next step streams slowly: the sub-agent works at the same time.
                [text('Meanwhile, '), { wait: 30 }, text('I read the notes.'), done],
                [text('All in: found it.'), done],
            ],
            child: [[{ wait: 10 }, text('Found it.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });

        const resolved = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        const end = indexOf(events, (e) => e.type === 'agent-end');
        expect(resolved, 'the call is answered').toBeGreaterThan(-1);
        expect(end, 'before the sub-agent is back').toBeGreaterThan(resolved);
        // The model's own words and the sub-agent's are interleaved: neither waited.
        const firstOwnText = indexOf(events, (e) => e.type === 'text-delta' && agentIdOf(e) === undefined);
        const childText = indexOf(events, (e) => e.type === 'text-delta' && agentIdOf(e) !== undefined);
        const lastOwnTextBeforeReport = indexOf(events, (e) => e.type === 'text-delta' && e.delta === 'I read the notes.');
        expect(firstOwnText).toBeLessThan(childText);
        expect(childText).toBeLessThan(lastOwnTextBeforeReport);
    });

    it('gets its own line, not its call\'s: its start names no call', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Done.'), done]],
            child: [[text('ok'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        expect(events.find((e) => e.type === 'agent-start')).toEqual({
            type: 'agent-start', agentId: expect.any(String), name: 'scout', description: 'Look it up',
        });
    });

    it('holds the run until it is back, then tells the model what it answered', async () => {
        const { transportCall, requests } = scripted({
            parent: [
                [toolUse('c1', 'delegate'), done],
                [text('I will wait for the scout.'), done],
                [text('The scout found it.'), done],
            ],
            child: [[{ wait: 20 }, text('Found it on page 3.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const runDone = indexOf(events, (e) => e.type === 'run-done');
        expect(events[end]).toMatchObject({ status: 'done', result: 'Found it on page 3.' });
        expect(end).toBeLessThan(runDone);
        // The model was asked once more after the sub-agent, and that last part is the reply's end.
        const parentRequests = requests.filter((r) => r.modelId === 'parent');
        expect(parentRequests).toHaveLength(3);
        const lastAsk = parentRequests[2]!.messages;
        // What it said before waiting is in its history, then what the sub-agent answered.
        expect(lastAsk.at(-2)).toEqual({ role: 'assistant', content: 'I will wait for the scout.' });
        expect(lastAsk.at(-1)!.role).toBe('user');
        expect(String(lastAsk.at(-1)!.content)).toContain('scout');
        expect(String(lastAsk.at(-1)!.content)).toContain('Found it on page 3.');
        expect(indexOf(events, (e) => e.type === 'text-delta' && e.delta === 'The scout found it.')).toBeGreaterThan(end);
    });

    it('tells the model about every sub-agent in one message, those back early included', async () => {
        const two: StreamToolHandler = async (_call, _signal, run) => {
            startSubAgent(run!, { name: 'fast', request: ask('fast') });
            startSubAgent(run!, { name: 'slow', request: ask('slow') });
            return { content: 'Started two.' };
        };
        const { transportCall, requests } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [{ wait: 20 }, text('Waiting.'), done], [text('Both in.'), done]],
            fast: [[text('Fast answer.'), done]],
            slow: [[{ wait: 60 }, text('Slow answer.'), done]],
        });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => two, emitter: () => {}, signal: new AbortController().signal,
        });
        const parentRequests = requests.filter((r) => r.modelId === 'parent');
        expect(parentRequests).toHaveLength(3);
        const report = String(parentRequests[2]!.messages.at(-1)!.content);
        expect(report).toContain('Fast answer.');
        expect(report).toContain('Slow answer.');
    });

    it('says how a sub-agent ended when it did not answer', async () => {
        const { transportCall, requests } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Waiting.'), done], [text('It failed.'), done]],
            child: [],
        });
        const failing = async (request: Parameters<typeof transportCall>[0]) => {
            if (request.modelId === 'child') throw new Error('the model is down');
            return transportCall(request);
        };
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall: failing,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'failed', error: 'the model is down' });
        const report = String(requests.filter((r) => r.modelId === 'parent')[2]!.messages.at(-1)!.content);
        expect(report).toContain('failed');
        expect(report).toContain('the model is down');
    });

    it('is stopped by a Stop, before the run ends, and nothing of it comes after', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Waiting.'), done]],
            child: [[{ wait: 200 }, text('Too late.'), done]],
        });
        const { events, emitter } = recorder();
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 40);
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: controller.signal,
        });
        await new Promise((r) => setTimeout(r, 250));

        const end = indexOf(events, (e) => e.type === 'agent-end');
        expect(events[end]).toMatchObject({ status: 'stopped' });
        expect(end).toBeLessThan(indexOf(events, (e) => e.type === 'run-aborted'));
        expect(last(events, (e) => agentIdOf(e) !== undefined || e.type === 'agent-end')).toBeLessThan(indexOf(events, (e) => e.type === 'run-done'));
        expect(events.some((e) => e.type === 'text-delta' && e.delta === 'Too late.')).toBe(false);
    });

    it('is stopped at the turn limit, before the run ends', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [toolUse('c2', 'delegate'), done]],
            // Both sub-agents ask the same model: each its own slow answer.
            child: [[{ wait: 200 }, text('Too late.'), done], [{ wait: 200 }, text('Too late.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, maxTurns: 2,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        const ends = events.filter((e) => e.type === 'agent-end');
        expect(ends).toHaveLength(2);
        for (const e of ends) expect(e).toMatchObject({ status: 'stopped' });
        expect(last(events, (e) => e.type === 'agent-end')).toBeLessThan(indexOf(events, (e) => e.type === 'run-done'));
    });

    it('is stopped when the run crashes, so nothing of it comes after', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done]],
            child: [[{ wait: 50 }, text('Too late.'), done]],
        });
        const crashing = async (request: Parameters<typeof transportCall>[0]) => {
            if (request.modelId === 'parent' && request.messages.some((m) => m.role === 'tool')) throw new Error('boom');
            return transportCall(request);
        };
        const { events, emitter } = recorder();
        await expect(runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall: crashing,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        })).rejects.toThrow('boom');
        const settled = events.length;
        await new Promise((r) => setTimeout(r, 120));
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'stopped' });
        expect(events.length, 'nothing after the crash').toBe(settled);
    });

    it('hands back its signal, which a Stop aborts', async () => {
        let seen: AbortSignal | undefined;
        const keep: StreamToolHandler = async (_call, _signal, run) => {
            seen = startSubAgent(run!, { name: 'scout', request: ask('child') }).signal;
            return { content: 'Started.' };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Waiting.'), done]],
            child: [[{ wait: 200 }, text('Too late.'), done]],
        });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 40);
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => keep, emitter: () => {}, signal: controller.signal,
        });
        expect(seen?.aborted).toBe(true);
    });

    it('is stopped, and the model not asked again, when the turn that waits for it is the last allowed', async () => {
        const { transportCall, requests } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Waiting.'), done], [text('Never asked.'), done]],
            child: [[{ wait: 200 }, text('Too late.'), done]],
        });
        const appended: unknown[] = [];
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, maxTurns: 2,
            onHistoryAppend: (m) => appended.push(m),
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        expect(requests.filter((r) => r.modelId === 'parent')).toHaveLength(2);
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'stopped' });
        expect(events.some((e) => e.type === 'turn-limit-exceeded')).toBe(true);
        // Nothing the model will never read is left in a history its host keeps.
        expect(appended.some((m) => (m as { role: string }).role === 'user')).toBe(false);
    });

    it('waits for it after a whole answer from a provider that does not stream', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'delegate'), done]], child: [[{ wait: 20 }, text('Found it.'), done]] });
        let parentCalls = 0;
        const mixed = async (request: Parameters<typeof transportCall>[0]) => {
            if (request.modelId !== 'parent') return transportCall(request);
            parentCalls += 1;
            if (parentCalls === 1) return transportCall(request);
            return parentCalls === 2 ? 'Waiting.' : 'It found it.';
        };
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall: mixed as never,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        expect(parentCalls).toBe(3);
        expect(indexOf(events, (e) => e.type === 'agent-end')).toBeLessThan(indexOf(events, (e) => e.type === 'text-delta' && e.delta === 'It found it.'));
    });

    it('is stopped when it outlives the tool time limit, and the run goes on', async () => {
        const { transportCall, requests } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Waiting.'), done], [text('It ran out of time.'), done]],
            child: [[{ wait: 400 }, text('Too late.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, toolTimeoutMs: 50,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'stopped' });
        expect(String(requests.filter((r) => r.modelId === 'parent')[2]!.messages.at(-1)!.content)).toContain('was stopped');
        expect(events.some((e) => e.type === 'text-delta' && e.delta === 'It ran out of time.')).toBe(true);
    });

    it('does not start once the run is over: nothing of it comes after the run', async () => {
        let later: (() => void) | undefined;
        const leaking: StreamToolHandler = async (_call, _signal, run) => {
            later = () => { startSubAgent(run!, { name: 'late', request: ask('child') }); };
            return { content: 'ok' };
        };
        const { transportCall, requests } = scripted({ parent: [[toolUse('c1', 'leak'), done], [text('Done.'), done]], child: [[text('billed'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => leaking, emitter, signal: new AbortController().signal,
        });
        const settled = events.length;
        later!();
        await new Promise((r) => setTimeout(r, 30));
        expect(events.length).toBe(settled);
        expect(requests.some((r) => r.modelId === 'child')).toBe(false);
    });

    it('cannot be started in a run that can pause: the run would end without it', async () => {
        let thrown: unknown;
        const tries: StreamToolHandler = async (_call, _signal, run) => {
            try { startSubAgent(run!, { name: 'scout', request: ask('child') }); } catch (error) { thrown = error; }
            return { content: 'ok' };
        };
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'try'), done], [text('Done.'), done]] });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, deferral: { outcomes: {} },
            toolLookup: () => tries, emitter: () => {}, signal: new AbortController().signal,
        });
        expect(thrown).toBeInstanceOf(TypeError);
        expect(String((thrown as Error).message)).toMatch(/runSubAgent/);
    });

    it('refuses to start without the run its tool was called in', () => {
        expect(() => startSubAgent(undefined as never, { request: ask('child') })).toThrow(TypeError);
    });
});
