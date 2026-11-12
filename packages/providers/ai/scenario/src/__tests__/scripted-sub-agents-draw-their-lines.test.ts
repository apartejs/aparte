/**
 * Scripted sub-agents draw their lines.
 *
 * The whole path a demo takes: the scripted model, core's client and loop, a real
 * `<aparte-chat-viewport>`, and `@aparte/plugin-subagents`. Each sub-agent is one line,
 * named by it; none of its words reach the reply.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupSubagents } from '@aparte/plugin-subagents';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { page, starts } from './page.js';

let stop: (() => void) | undefined;
afterEach(() => {
    stop?.();
    stop = undefined;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const frame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));
const names = (root: Element): string[] =>
    [...root.querySelectorAll<HTMLElement>('.aparte-tool-name')].filter((el) => !el.hidden).map((el) => el.textContent ?? '');

describe('scripted sub-agents on a page with the plugin', () => {
    it('one sub-agent: the call is its line, and its words stay out of the reply', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ text: 'Delegating.' }, { subagents: [{ name: 'Researcher', task: 'Read the parser', turns: ['CHILD-WORDS'] }], id: 'd1' }],
                'Done.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)], (config) => { stop = setupSubagents({}, config); });
        await p.send('Go');
        await frame();

        const rows = p.viewport.querySelectorAll('.aparte-segment-tool-call');
        expect(rows).toHaveLength(1);
        expect(names(p.viewport)).toEqual(['Researcher']);
        expect(p.viewport.textContent).toContain('Read the parser');
        expect(p.viewport.textContent).not.toContain('CHILD-WORDS');
        expect(p.viewport.textContent).toContain('Done.');
    });

    it('three side by side: one line each, none of their words in the reply', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [
                    { name: 'Reader', task: 'Read the parser', turns: ['READER-WORDS'] },
                    { name: 'Searcher', task: 'Find its callers', turns: ['SEARCHER-WORDS'] },
                    { name: 'Tester', task: 'Run the tests', turns: ['TESTER-WORDS'] },
                ], id: 'd1' }],
                'All three reported.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)], (config) => { stop = setupSubagents({}, config); });
        await p.send('Go');
        await frame();

        expect(starts(p.events)).toHaveLength(3);
        for (const s of starts(p.events)) {
            const line = p.viewport.querySelector(`[data-segment-id="subagent-${s.agentId}"]`);
            expect(line).not.toBeNull();
            // The line says who and what, never what the sub-agent wrote.
            expect(line!.textContent).not.toMatch(/-WORDS/);
        }
        expect(names(p.viewport)).toEqual(expect.arrayContaining(['Reader', 'Searcher', 'Tester']));
        // The reply's own text is the parent's. (The `delegate` call stays an ordinary row
        // beside the three lines: its output is what the parent model read, one block each.)
        const texts = (p.reply()?.segments ?? []).filter((x) => x.type === 'text').map((x) => (x as { content: string }).content);
        expect(texts).toEqual(['All three reported.']);
        expect(p.viewport.textContent).toContain('All three reported.');
    });
});
