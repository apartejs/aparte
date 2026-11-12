/**
 * A scripted sub-agent answers what its tool said.
 *
 * A turn may be a function of the request the nested loop sends: called when that turn is
 * played, it reads the sub-agent's conversation — the last tool result included — so a script
 * whose command was refused says so instead of reporting a run that never happened. Plain
 * turns are unchanged beside it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentToText, type AparteChatRequest, type AparteToolCall } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool, type ScenarioSubagent } from '../index.js';
import { page } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const runCommand = {
    tool: { name: 'run_command', description: 'Run a command.', inputSchema: { type: 'object', properties: { cmd: { type: 'string' } } } },
    handler: async (call: AparteToolCall) => ({ toolCallId: call.id, content: 'Build finished in 12.4s. 0 errors.' }),
};

const lastResult = (request: AparteChatRequest): string => {
    const last = request.messages[request.messages.length - 1];
    return last?.role === 'tool' ? contentToText(last.content) : '';
};

/** A build runner whose answer follows its command's result, and records what it was handed. */
function buildRunner(seen: AparteChatRequest[]): ScenarioSubagent {
    return {
        name: 'Build runner',
        task: 'Run the build',
        turns: [
            [{ tool: 'run_command', input: { cmd: 'pnpm build' }, id: 'c1' }],
            (request) => {
                seen.push(request);
                return /refused|rejected/i.test(lastResult(request))
                    ? 'I could not run the build: the command was refused.'
                    : 'The build passed.';
            },
        ],
    };
}

function delegation(agent: ScenarioSubagent) {
    return createScenarioProvider({
        pacing: 'instant',
        turns: [[{ subagents: [agent], id: 'd1' }], 'Done.'],
    });
}

describe('a scripted sub-agent whose turn is a function', () => {
    it('is handed the request with its tool result, and answers from it', async () => {
        const seen: AparteChatRequest[] = [];
        const provider = delegation(buildRunner(seen));
        const p = page(provider, [scenarioSubagentTool(provider), runCommand]);
        await p.send('Build it.');

        expect(seen).toHaveLength(1);
        const last = seen[0]!.messages[seen[0]!.messages.length - 1]!;
        expect(last).toMatchObject({ role: 'tool', toolCallId: 'c1' });
        expect(contentToText(last.content)).toBe('Build finished in 12.4s. 0 errors.');
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1')).toMatchObject({ result: 'The build passed.' });
    });

    it('says the command was refused when it was', async () => {
        const seen: AparteChatRequest[] = [];
        const provider = delegation(buildRunner(seen));
        const p = page(provider, [scenarioSubagentTool(provider), runCommand], (config) => {
            config.setApprovalPolicy((call) => (call.name === 'run_command' ? { verdict: 'deny' } : undefined));
        });
        await p.send('Build it.');

        expect(seen).toHaveLength(1);
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1'))
            .toMatchObject({ result: 'I could not run the build: the command was refused.' });
    });

    it('leaves plain turns as they were, the last one repeating', async () => {
        const provider = delegation({
            name: 'Reader',
            task: 'Read',
            turns: [[{ tool: 'run_command', input: { cmd: 'ls' }, id: 'c1' }], 'Read it.'],
        });
        const p = page(provider, [scenarioSubagentTool(provider), runCommand]);
        await p.send('Read it.');
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1')).toMatchObject({ result: 'Read it.' });
    });
});
