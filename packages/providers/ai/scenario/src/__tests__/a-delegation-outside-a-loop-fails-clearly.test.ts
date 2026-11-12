/**
 * A delegation outside a loop fails clearly.
 *
 * A sub-agent is a nested run, and a handler gets the run it would nest in only from the
 * loop (`context.run`). Called any other way — the provider used with an app's own loop, a
 * browser tool answering a paused server run — there is nothing to open it from, and the
 * handler says so by name rather than failing on an `undefined` somewhere inside.
 */
import { describe, it, expect } from 'vitest';
import type { AparteAIProvider } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';

const call = { id: 'd1', name: 'delegate', input: { agents: [{ name: 'Researcher', task: 'Read' }] } };

describe('the delegate handler, called outside the agent loop', () => {
    it('rejects, naming the missing `context.run`', async () => {
        const { handler } = scenarioSubagentTool(createScenarioProvider());
        await expect(handler(call, new AbortController().signal)).rejects.toThrow(/context\.run/);
        await expect(handler(call, new AbortController().signal, { config: {} })).rejects.toThrow(/outside the agent loop/);
    });
});

describe('scenarioSubagentTool', () => {
    it('refuses a provider it did not make, at once', () => {
        const other = { id: 'other', getMetadata: () => ({ id: 'other', name: 'Other' }), getModels: () => [] } as unknown as AparteAIProvider;
        expect(() => scenarioSubagentTool(other)).toThrow(/createScenarioProvider/);
    });

    it('describes a tool a real model could call: a name, a sentence, a schema for the agents', () => {
        const { tool } = scenarioSubagentTool(createScenarioProvider());
        expect(tool.name).toBe('delegate');
        expect(tool.description.length).toBeGreaterThan(20);
        expect(tool.inputSchema).toMatchObject({
            type: 'object',
            required: ['agents'],
            properties: { agents: { type: 'array', items: { type: 'object', required: ['name', 'task'] } } },
        });
        expect(scenarioSubagentTool(createScenarioProvider(), { name: 'research' }).tool.name).toBe('research');
    });
});
