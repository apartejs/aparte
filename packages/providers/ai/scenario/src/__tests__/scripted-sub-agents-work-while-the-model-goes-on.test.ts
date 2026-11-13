/**
 * Scripted sub-agents can work while the model goes on.
 *
 * A `subagents` step with `background: true` starts them and answers its call at once: the
 * model's next turn plays while they work (its text, its own tool calls), and once it has
 * nothing more to say the loop waits for them and asks it again, with a message saying how
 * each ended. Without it, as before, the call holds until they are back.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('scripted sub-agents in the background', () => {
    it('answer their call at once; the model writes on while they work, and answers once they are back', async () => {
        const provider = createScenarioProvider({
            pacing: { chunk: 4, delay: 3 },
            turns: [
                [{ text: 'Two of you, go.' }, { subagents: [
                    { name: 'Reader', task: 'Read the parser', turns: [[{ wait: 40 }, { text: 'The parser reads tokens.' }]] },
                    { name: 'Searcher', task: 'Find its callers', turns: [[{ wait: 60 }, { text: 'Two callers found.' }]] },
                ], background: true, id: 'd1' }],
                // While they work.
                'Meanwhile, I look at the tests myself.',
                // Once they are back.
                'Both are back: the parser reads tokens, and two places call it.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Look into the parser');

        const resolved = p.events.findIndex((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1');
        const firstEnd = p.events.findIndex((e) => e.type === 'agent-end');
        expect(resolved, 'the call answered before any of them was back').toBeLessThan(firstEnd);
        const result = (p.events[resolved] as { result: string }).result;
        expect(result).toMatch(/Reader/);
        expect(result).toMatch(/Searcher/);

        // The model's words while they worked came before they were back, and its last ones after.
        // (The text streams in chunks: what the model said is read on each side of the last end.)
        const lastEnd = p.events.map((e) => e.type).lastIndexOf('agent-end');
        const own = (from: number, to: number) => p.events.slice(from, to)
            .filter((e) => e.type === 'text-delta' && (e as { agentId?: string }).agentId === undefined)
            .map((e) => (e as { delta: string }).delta).join('');
        // It was writing while they worked (it may still be when the last one is back).
        expect(own(resolved, lastEnd)).toMatch(/^Meanwhile/);
        expect(own(lastEnd, p.events.length)).toMatch(/Both are back: the parser reads tokens, and two places call it\.$/);

        // Each its own line, each done.
        for (const s of starts(p.events)) expect(s.toolCallId).toBeUndefined();
        expect(endsOf(p.events).map((e) => e.status)).toEqual(['done', 'done']);
        expect(textOf(p.events, undefined)).toBe('Two of you, go.Meanwhile, I look at the tests myself.Both are back: the parser reads tokens, and two places call it.');
    });

    it('each plays its turns in order: a tool call, then its answer', async () => {
        const readFile = {
            tool: { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
            handler: async (call: { id: string }) => ({ toolCallId: call.id, content: 'export const parse = () => 42;' }),
        };
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{
                    name: 'Reader',
                    task: 'Read the parser',
                    turns: [[{ tool: 'read_file', input: { path: 'parser.ts' }, id: 'r1' }], 'It returns 42.'],
                }], background: true, id: 'd1' }],
                'Waiting.',
                'It returns 42, the reader says.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider), readFile]);
        await p.send('Go');
        const [start] = starts(p.events);
        expect(textOf(p.events, start!.agentId)).toBe('It returns 42.');
        expect(p.events.filter((e) => e.type === 'tool-start' && (e as { agentId?: string }).agentId === start!.agentId)).toHaveLength(1);
        expect(endsOf(p.events).map((e) => e.status)).toEqual(['done']);
    });

    it('the model is told what each answered', async () => {
        const seen: string[] = [];
        const provider = createScenarioProvider({
            pacing: 'instant',
            match: (request) => {
                const last = request.messages[request.messages.length - 1]!;
                if (last.role === 'user' && typeof last.content === 'string' && last.content.includes('back')) seen.push(last.content);
                return undefined;
            },
            scenarios: {
                start: { turn: [{ subagents: [{ name: 'Reader', task: 'Read the parser', turns: ['The parser reads tokens.'] }], background: true, id: 'd1' }] },
                waiting: { after: 'delegate', turn: 'Waiting for the reader.' },
                // The message that says it is back is the last user message the model reads.
                back: { when: /is back/, turn: 'Done.' },
            },
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        expect(textOf(p.events, undefined)).toBe('Waiting for the reader.Done.');
        expect(seen).toHaveLength(1);
        expect(seen[0]).toContain('Reader');
        expect(seen[0]).toContain('The parser reads tokens.');
    });
});
