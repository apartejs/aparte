/**
 * A delegation with no script says so.
 *
 * The tool is an ordinary tool, so something else can call it: a real model that found it in
 * the inventory, or a call replayed after a reload. There is no script for that call, and
 * inventing one would be a lie; the call answers with a plain sentence the model can read,
 * opens no sub-agent, and the turn goes on.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a delegate call the script did not write', () => {
    it('answers with a sentence that no script exists for it, and opens nothing', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                // What a real model calling the tool on its own looks like: a bare call.
                [{ tool: 'delegate', input: { agents: [{ name: 'Researcher', task: 'Read the parser' }] }, id: 'x1' }],
                'I will read it myself.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        expect(starts(p.events)).toEqual([]);
        const resolved = p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'x1') as { result: string } | undefined;
        expect(resolved?.result).toMatch(/no script/i);
        expect(p.events.some((e) => e.type === 'tool-failed')).toBe(false);
        expect(textOf(p.events, undefined)).toBe('I will read it myself.');
    });
});
