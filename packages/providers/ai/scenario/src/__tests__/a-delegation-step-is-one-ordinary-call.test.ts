/**
 * A delegation step is one ordinary call.
 *
 * On the wire the step is a `tool_use` like any other — the name, and the input a real model
 * would send, nothing of the scripts — so the turn's usage estimate and every other step are
 * as they were. The scripts are filed under the id the LOOP gives the call, so two
 * delegations sharing an id in one turn (the loop renames the second) each find their own.
 * And a `scenarios` record that delegates without an `after: 'delegate'` route is warned
 * about, as any tool call is.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AparteStreamEvent } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

async function drain(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const reader = stream.getReader();
    const out: AparteStreamEvent[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out.push(value);
    }
}

describe('a delegation step on the wire', () => {
    it('is one tool_use with what a real model sends, and the usage counts only the text', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [[{ text: 'abcdefgh' }, { subagents: [{ name: 'R', task: 'Read', turns: ['A long answer the parent never wrote.'] }], id: 'd1' }]],
        });
        const events = await drain(await provider.chat!({ modelId: 'scripted', messages: [{ role: 'user', content: 'go' }] }, undefined, { providerId: provider.id }) as ReadableStream<AparteStreamEvent>);
        expect(events).toEqual([
            { type: 'text', delta: 'abcdefgh' },
            { type: 'tool_use', id: 'd1', name: 'delegate', input: { agents: [{ name: 'R', task: 'Read' }] } },
            { type: 'done', usage: expect.objectContaining({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }) },
        ]);
    });
});

describe('two delegations sharing an id in one turn', () => {
    it('each finds its own scripts under the id the loop gave it', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [
                    { subagents: [{ name: 'First', task: 'One', turns: ['From the first.'] }], id: 'same' },
                    { subagents: [{ name: 'Second', task: 'Two', turns: ['From the second.'] }], id: 'same' },
                ],
                'Both answered.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        const [first, second] = starts(p.events);
        expect(first).toMatchObject({ name: 'First', toolCallId: 'same' });
        expect(second).toMatchObject({ name: 'Second', toolCallId: 'same#2' });
        expect(textOf(p.events, first!.agentId)).toBe('From the first.');
        expect(textOf(p.events, second!.agentId)).toBe('From the second.');
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'same#2')).toMatchObject({ result: 'From the second.' });
    });
});

describe('a scenarios record that delegates', () => {
    it('warns at creation when nothing routes the delegation\'s answer', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            scenarios: { audit: { when: 'audit', turn: [{ subagents: [{ name: 'R', task: 'Read', turns: ['Ok.'] }] }] } },
        });
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]?.[0])).toContain('`delegate`');
    });

    it('is quiet when `after: \'delegate\'` routes it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            scenarios: {
                audit: { when: 'audit', turn: [{ subagents: [{ name: 'R', task: 'Read', turns: ['Ok.'] }] }] },
                report: { after: 'delegate', turn: 'Here is what they found.' },
            },
        });
        expect(warn).not.toHaveBeenCalled();
    });
});
