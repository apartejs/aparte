/**
 * n8n names no call: a stream that begins after an agent's block ended empty is taken for that
 * agent's sub-agent, and only the agent streaming again proves it. Until then nothing of it is
 * attributed. When the proof never comes (two agents in a row, the first answering nothing),
 * it was never a sub-agent: its text is the reply's, drawn once — not streamed to a line, then
 * drawn again into the reply.
 */
import { describe, it, expect } from 'vitest';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createN8nRunner } from '../index.js';

type Event = { type: string; agentId?: string; delta?: string; [key: string]: unknown };

const frames = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const meta = (nodeId: string) => ({ metadata: { nodeId, nodeName: `Node ${nodeId}`, itemIndex: 0, runIndex: 0 } });
const block = (node: string, ...items: string[]) => [
    { type: 'begin', ...meta(node) },
    ...items.map((content) => ({ type: 'item', content, ...meta(node) })),
    { type: 'end', ...meta(node) },
];

async function run(body: string) {
    const events: Event[] = [];
    const fetch = (async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })) as unknown as typeof globalThis.fetch;
    await createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch, onWarning: () => {} })({
        messageId: 'm1',
        providerId: 'n8n',
        baseRequest: { messages: [{ role: 'user', content: 'Hi' }], modelId: 'n8n', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: Event) => events.push(e),
        signal: new AbortController().signal,
    } as unknown as AparteStreamRunOptions);
    const texts = events.filter((e) => e.type === 'text-delta');
    return { events, all: texts.map((e) => e.delta).join(''), reply: texts.filter((e) => !e.agentId).map((e) => e.delta).join('') };
}

describe('a node taken for a sub-agent is drawn once', () => {
    it('draws two agents in a row, the first answering nothing, as the reply alone: no line, no second copy', async () => {
        const r = await run(frames(...block('a'), ...block('b', 'B answers.')));
        expect(r.all).toBe('B answers.');
        expect(r.reply).toBe('B answers.');
        expect(r.events.filter((e) => e.type === 'agent-start' || e.type === 'agent-end')).toEqual([]);
        expect(r.events.at(-1)).toEqual({ type: 'run-done' });
    });

    it('draws every node after the empty one in the reply, in order, when the agent never streams again', async () => {
        const r = await run(frames(...block('a'), ...block('b', 'B says. '), ...block('c', 'C says.')));
        expect(r.all).toBe('B says. C says.');
        expect(r.reply).toBe('B says. C says.');
        expect(r.events.some((e) => e.agentId !== undefined)).toBe(false);
    });

    it('still draws a sub-agent its caller came back from on its line, its text once', async () => {
        const r = await run(frames(...block('a'), ...block('b', 'Found it.'), ...block('a', 'Here it is.')));
        expect(r.all).toBe('Found it.Here it is.');
        expect(r.reply).toBe('Here it is.');
        const start = r.events.find((e) => e.type === 'agent-start')!;
        expect(r.events.filter((e) => e.type === 'text-delta' && e.agentId === start.agentId).map((e) => e.delta)).toEqual(['Found it.']);
    });
});
