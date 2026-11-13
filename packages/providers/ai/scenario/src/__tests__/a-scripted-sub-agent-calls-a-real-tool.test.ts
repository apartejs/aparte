/**
 * A scripted sub-agent calls the page's real tools.
 *
 * Its `{ tool }` step is a call of the nested loop, which looks the handler up the way the
 * run does: the page's registered `read_file` runs, its row is the sub-agent's, and the
 * sub-agent's next turn follows the result — routed by the conversation, the way a model
 * would read it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AparteToolCall } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, of, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a scripted sub-agent that calls a tool', () => {
    it('runs the registered handler, and its next turn reads the result', async () => {
        const reads: AparteToolCall[] = [];
        const readFile = {
            tool: { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
            handler: async (call: AparteToolCall) => {
                reads.push(call);
                return { toolCallId: call.id, content: 'export const parse = () => 42;' };
            },
        };
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{
                    name: 'Reader',
                    task: 'Read the parser',
                    turns: [
                        [{ text: 'Opening it.' }, { tool: 'read_file', input: { path: 'parser.ts' }, id: 'r1' }],
                        'It returns 42.',
                    ],
                }], id: 'd1' }],
                'The parser returns 42.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider), readFile]);
        await p.send('What does the parser return?');

        // The page's own handler ran, with the sub-agent's arguments.
        expect(reads).toEqual([{ id: 'r1', name: 'read_file', input: { path: 'parser.ts' } }]);

        // The call is the sub-agent's: its row, its result, under its id.
        const [start] = starts(p.events);
        const child = of(p.events, start!.agentId);
        expect(child.find((e) => e.type === 'tool-start')).toMatchObject({ toolCallId: 'r1', name: 'read_file' });
        expect(child.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'r1', result: 'export const parse = () => 42;' });
        // Nothing of it is the parent's.
        expect(of(p.events, undefined).some((e) => 'toolCallId' in e && e.toolCallId === 'r1')).toBe(false);

        // The next turn followed the result, and is what the parent read.
        expect(textOf(p.events, start!.agentId)).toBe('Opening it.It returns 42.');
        expect(endsOf(p.events)[0]).toMatchObject({ status: 'done', result: 'It returns 42.' });
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1')).toMatchObject({ result: 'It returns 42.' });
    });
});
