/**
 * A scripted step shows while it lasts.
 *
 * `{ step: 'Reading the parser' }` opens a named step and `{ endStep: 'Reading the parser' }`
 * ends it — what an agent announces as it works. The two may sit in different turns, so a step
 * can span a tool call; one never closed ends with the reply. In a scripted sub-agent the step
 * is the sub-agent's. The reply keeps nothing of it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentToText, type AparteChatRequest } from '@aparte/core';
import { createScenarioProvider, playTurn, scenarioSubagentTool } from '../index.js';
import { page, starts } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const request: AparteChatRequest = { modelId: 'scripted', messages: [{ role: 'user', content: 'go' }] };

async function eventsOf(stream: ReadableStream<{ type: string }>): Promise<{ type: string }[]> {
    const out: { type: string }[] = [];
    const reader = stream.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out.push(value);
    }
}

describe('a scripted step', () => {
    it('is played as step-start and step-end, in its place among the other steps', async () => {
        const events = await eventsOf(playTurn(
            [{ step: 'Reading the parser' }, { text: 'It reads tokens.' }, { endStep: 'Reading the parser' }],
            request, 'instant',
        ));
        expect(events.filter((e) => e.type !== 'done')).toEqual([
            { type: 'step-start', name: 'Reading the parser' },
            { type: 'text', delta: 'It reads tokens.' },
            { type: 'step-end', name: 'Reading the parser' },
        ]);
    });

    it('reaches the page as the reply\'s step, across a tool call, and the reply keeps nothing of it', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ step: 'Reading the parser' }, { tool: 'read_file', input: { path: 'parser.ts' }, id: 'r1' }],
                [{ endStep: 'Reading the parser' }, { text: 'The parser reads tokens.' }],
            ],
        });
        const readFile = {
            tool: { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object', properties: {} } },
            handler: async () => ({ toolCallId: 'r1', content: 'export function parse() {}' }),
        };
        const p = page(provider, [readFile]);
        await p.send('How does the parser work?');

        const types = p.events.map((e) => e.type);
        expect(types.indexOf('step-start')).toBeLessThan(types.indexOf('tool-start'));
        expect(types.indexOf('step-end')).toBeGreaterThan(types.indexOf('tool-resolved'));
        expect(p.events.filter((e) => e.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'Reading the parser' },
            { type: 'step-end', name: 'Reading the parser' },
        ]);
        expect(JSON.stringify(p.reply())).not.toContain('Reading the parser');
    });

    it('in a scripted sub-agent, is the sub-agent\'s', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{ name: 'Researcher', task: 'Read the parser', turns: [[{ step: 'Searching' }, { text: 'Found it.' }, { endStep: 'Searching' }]] }], id: 'd1' }],
                'Done.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        const [start] = starts(p.events);
        expect(p.events.filter((e) => e.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'Searching', agentId: start!.agentId },
            { type: 'step-end', name: 'Searching', agentId: start!.agentId },
        ]);
        // What the model reads of it: the sub-agent's text, nothing of its step.
        expect(contentToText(p.reply()?.content ?? '')).not.toContain('Searching');
    });
});
