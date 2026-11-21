/**
 * A sub-agent cut short says so: it ends `partial`, with why and with what it found.
 *
 * `runSubAgent` ended every sub-agent whose nested loop returned as `done`, the turn limit and a
 * call that stopped its run included. The parent model read "done" and the last text, often empty
 * after a round of tool calls only, and the line said Done while the transcript under it showed
 * the turn limit's error.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent, startSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { ask, done, scripted, text, toolUse } from './sub-agent-script';

async function delegate(child: Parameters<typeof scripted>[0][string], childOptions: { maxTurns?: number } = {}, toolsOfChild: Record<string, StreamToolHandler> = {}) {
    const events: StreamRunEvent[] = [];
    let returned: Awaited<ReturnType<typeof runSubAgent>> | undefined;
    const { transportCall } = scripted({
        parent: [[toolUse('d1', 'delegate')], [done]],
        child,
    });
    const delegateTool: StreamToolHandler = async (_call, signal, run) => {
        returned = await runSubAgent(run!, { name: 'Reader', request: ask('child'), ...childOptions }, signal);
        return { content: returned.text };
    };
    await runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), transportCall,
        toolLookup: (name) => (name === 'delegate' ? delegateTool : toolsOfChild[name]),
        emitter: (e) => { events.push(e); },
        signal: new AbortController().signal,
    });
    const end = events.find((e) => e.type === 'agent-end') as Extract<StreamRunEvent, { type: 'agent-end' }> | undefined;
    return { returned: returned!, end };
}

const read: StreamToolHandler = async () => ({ content: 'a line of the file' });

describe('a sub-agent cut short', () => {
    it('by its turn limit ends partial, with the reason and what it wrote', async () => {
        const { returned, end } = await delegate(
            [[text('Reading the parser.'), toolUse('r1', 'read')], [text('Still reading.'), toolUse('r2', 'read')]],
            { maxTurns: 2 },
            { read },
        );
        expect(returned).toMatchObject({ status: 'partial', reason: 'turn-limit' });
        expect(end).toMatchObject({ status: 'partial', reason: 'turn-limit', result: 'Still reading.' });
    });

    it('by a call its run could not make ends partial, with that reason', async () => {
        const { returned, end } = await delegate([[text('Looking.'), toolUse('x1', 'missing_tool')]]);
        expect(returned).toMatchObject({ status: 'partial', reason: 'no-handler' });
        expect(end).toMatchObject({ status: 'partial', reason: 'no-handler' });
    });

    it('in the background tells the model it was cut short, why, and what it found', async () => {
        const { transportCall, requests } = scripted({
            parent: [[toolUse('d1', 'delegate'), done], [text('Waiting.'), done], [text('It was cut.'), done]],
            child: [[text('Reading the parser.'), toolUse('r1', 'read')]],
        });
        const inBackground: StreamToolHandler = async (_call, _signal, run) => {
            startSubAgent(run!, { name: 'Reader', request: ask('child'), maxTurns: 1 });
            return { content: 'Started.' };
        };
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (name) => (name === 'delegate' ? inBackground : read),
            emitter: () => {}, signal: new AbortController().signal,
        });
        const report = String(requests.filter((r) => r.modelId === 'parent')[2]!.messages.at(-1)!.content);
        expect(report).toContain('Sub-agent "Reader" was cut short (turn-limit)');
        expect(report).toContain('Reading the parser.');
    });

    // A tool that cancels its own fetch (a timeout of its own) rejects with an AbortError nobody
    // asked for: the run stops on it, and the sub-agent did not answer.
    it('by a call that aborted itself ends partial, aborted', async () => {
        const selfAborting: StreamToolHandler = async () => { throw Object.assign(new Error('gave up'), { name: 'AbortError' }); };
        const { returned, end } = await delegate([[text('Looking.'), toolUse('f1', 'fetch')]], {}, { fetch: selfAborting });
        expect(returned).toMatchObject({ status: 'partial', reason: 'aborted' });
        expect(end).toMatchObject({ status: 'partial', reason: 'aborted', result: 'Looking.' });
    });

    it('by its call\'s time limit ends partial, timeout', async () => {
        const slow: StreamToolHandler = () => new Promise(() => {});
        const { transportCall } = scripted({ parent: [[toolUse('d1', 'delegate')], [done]], child: [[text('Waiting on it.'), toolUse('s1', 'slow')]] });
        let returned: Awaited<ReturnType<typeof runSubAgent>> | undefined;
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (name) => (name === 'delegate'
                ? async (_c, signal, run) => { returned = await runSubAgent(run!, { name: 'Reader', request: ask('child') }, signal); return { content: returned.text }; }
                : slow),
            toolConfigLookup: (name) => (name === 'slow' ? { timeoutMs: 10 } : undefined),
            emitter: () => {}, signal: new AbortController().signal,
        });
        expect(returned).toMatchObject({ status: 'partial', reason: 'timeout' });
    });

    it('by a decision nobody could take ends partial, no-resolver', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('d1', 'delegate')], [done]], child: [[text('Asking.'), toolUse('w1', 'write')]] });
        let returned: Awaited<ReturnType<typeof runSubAgent>> | undefined;
        // No approval channel in this run: the call that needs one cannot be decided.
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (name) => (name === 'delegate'
                ? async (_c, signal, run) => { returned = await runSubAgent(run!, { name: 'Writer', request: ask('child') }, signal); return { content: returned.text }; }
                : read),
            toolConfigLookup: (name) => (name === 'write' ? { needsApproval: true } : undefined),
            emitter: () => {}, signal: new AbortController().signal,
        });
        expect(returned).toMatchObject({ status: 'partial', reason: 'no-resolver' });
    });

    // Its own sub-agent cut short is that one's story: the parent answered, so it is done.
    it('is not cut short by a sub-agent of its own that was', async () => {
        const events: StreamRunEvent[] = [];
        const { transportCall } = scripted({
            parent: [[toolUse('d1', 'delegate')], [done]],
            child: [[toolUse('d2', 'delegate_deeper')], [text('Done above it.'), done]],
            grandchild: [[text('Deep.'), toolUse('r1', 'read')], [text('Deeper.'), toolUse('r2', 'read')]],
        });
        let outer: Awaited<ReturnType<typeof runSubAgent>> | undefined;
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (name) => {
                if (name === 'delegate') return async (_c, signal, run) => { outer = await runSubAgent(run!, { name: 'Outer', request: ask('child') }, signal); return { content: outer.text }; };
                if (name === 'delegate_deeper') return async (_c, signal, run) => { const r = await runSubAgent(run!, { name: 'Inner', request: ask('grandchild'), maxTurns: 1 }, signal); return { content: r.text }; };
                return read;
            },
            emitter: (e) => { events.push(e); },
            signal: new AbortController().signal,
        });
        const ends = events.filter((e) => e.type === 'agent-end') as Extract<StreamRunEvent, { type: 'agent-end' }>[];
        expect(ends.map((e) => e.status)).toEqual(['partial', 'done']);
        expect(outer).toMatchObject({ status: 'done', text: 'Done above it.' });
    });

    it('that answered is done, as before', async () => {
        const { returned, end } = await delegate([[text('The parser is fine.'), done]]);
        expect(returned).toMatchObject({ status: 'done', text: 'The parser is fine.' });
        expect(end).toMatchObject({ status: 'done', result: 'The parser is fine.' });
        expect(end).not.toHaveProperty('reason');
    });
});
