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
import { runSubAgent } from '../sub-agent';
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

    it('that answered is done, as before', async () => {
        const { returned, end } = await delegate([[text('The parser is fine.'), done]]);
        expect(returned).toMatchObject({ status: 'done', text: 'The parser is fine.' });
        expect(end).toMatchObject({ status: 'done', result: 'The parser is fine.' });
        expect(end).not.toHaveProperty('reason');
    });
});
