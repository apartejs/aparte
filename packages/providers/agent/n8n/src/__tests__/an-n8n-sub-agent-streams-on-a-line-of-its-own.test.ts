/**
 * An AI Agent Tool — the agent another n8n AI Agent calls as a tool — streams its text as
 * frames of its own node, between the end of its caller's block and the caller's next one.
 * The runner draws it as a sub-agent (`agent-start` / attributed text / `agent-end`), so
 * `@aparte/plugin-subagents` gives it a line and its text stays out of the reply.
 *
 * The `v2.47-*` fixtures were recorded from n8n 2.47.7 on a scripted OpenAI-compatible model
 * (fixtures/README.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createN8nRunner } from '../index.js';

type Event = { type: string; agentId?: string; [key: string]: unknown };
interface Recorded { status: number; contentType: string; body: string }

const fixture = (name: string): Recorded =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Recorded;

function respond(body: string | Uint8Array[]): Response {
    const chunks = typeof body === 'string' ? [new TextEncoder().encode(body)] : body;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

const byteByByte = (text: string) => Array.from(new TextEncoder().encode(text), (byte) => new Uint8Array([byte]));
const frames = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const meta = (nodeId: string, runIndex = 0) => ({ metadata: { nodeId, nodeName: `Node ${nodeId}`, itemIndex: 0, runIndex } });

function run(body: string | Uint8Array[], warnings: string[] = []) {
    const events: Event[] = [];
    const fetch = (async () => respond(body)) as unknown as typeof globalThis.fetch;
    const opts = {
        messageId: 'm1',
        providerId: 'n8n',
        baseRequest: { messages: [{ role: 'user', content: 'Research this for me, please.' }], modelId: 'n8n', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: Event) => events.push(e),
        signal: new AbortController().signal,
    } as unknown as AparteStreamRunOptions;
    const done = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch, onWarning: (m) => warnings.push(m) })(opts);
    const textOf = (agentId?: string) => events
        .filter((e) => e.type === 'text-delta' && e.agentId === agentId).map((e) => e.delta).join('');
    const starts = () => events.filter((e) => e.type === 'agent-start');
    return { done, events, reply: () => textOf(undefined), textOf, starts };
}

describe('an n8n sub-agent streams on a line of its own (recorded from n8n 2.47.7)', () => {
    it("draws an AI Agent Tool's text as a sub-agent named after its node, and keeps it out of the reply", async () => {
        const r = run(fixture('v2.47-stream-sub-agent').body);
        await expect(r.done).resolves.toBeUndefined();
        expect(r.reply()).toBe('ROOT-CHUNK-1 ROOT-CHUNK-2 ROOT-CHUNK-3');
        const [start] = r.starts();
        expect(start).toEqual({ type: 'agent-start', agentId: expect.any(String), name: 'Research Agent' });
        const id = start!.agentId!;
        expect(r.textOf(id)).toBe('SUB-CHUNK-1 SUB-CHUNK-2 SUB-CHUNK-3');
        const types = r.events.map((e) => `${e.type}${e.agentId ? '@sub' : ''}`);
        expect(types).toEqual([
            'run-start', 'turn-start',
            'agent-start@sub', 'text-delta@sub', 'text-delta@sub', 'text-delta@sub', 'text-flush@sub',
            'agent-end@sub',
            'text-delta', 'text-delta', 'text-delta', 'text-flush', 'run-done',
        ]);
        expect(r.events.find((e) => e.type === 'agent-end')).toEqual({
            type: 'agent-end', agentId: id, status: 'done', result: 'SUB-CHUNK-1 SUB-CHUNK-2 SUB-CHUNK-3',
        });
    });

    it('nests a sub-agent called by a sub-agent under it, and ends each when its caller streams again', async () => {
        const r = run(fixture('v2.47-stream-sub-agent-nested').body);
        await r.done;
        expect(r.reply()).toBe('ROOT-CHUNK-1 ROOT-CHUNK-2 ROOT-CHUNK-3');
        const [research, checker] = r.starts();
        expect(research).toMatchObject({ name: 'Research Agent' });
        expect(research).not.toHaveProperty('parentAgentId');
        expect(checker).toMatchObject({ name: 'Fact Checker', parentAgentId: research!.agentId });
        expect(r.textOf(checker!.agentId)).toBe('SUBSUB-CHUNK-1 SUBSUB-CHUNK-2 SUBSUB-CHUNK-3');
        expect(r.textOf(research!.agentId)).toBe('SUB-CHUNK-1 SUB-CHUNK-2 SUB-CHUNK-3');
        const ends = r.events.filter((e) => e.type === 'agent-end');
        expect(ends.map((e) => [e.agentId, e.parentAgentId])).toEqual([[checker!.agentId, research!.agentId], [research!.agentId, undefined]]);
        // The checker ends when the research agent streams again, before its text.
        const at = (pred: (e: Event) => boolean) => r.events.findIndex(pred);
        expect(at((e) => e.type === 'agent-end' && e.agentId === checker!.agentId))
            .toBeLessThan(at((e) => e.type === 'text-delta' && e.agentId === research!.agentId));
    });

    it('draws two lines when the agent calls its sub-agent twice in one reply', async () => {
        const r = run(fixture('v2.47-stream-sub-agent-twice').body);
        await r.done;
        const starts = r.starts();
        expect(starts.map((e) => e.name)).toEqual(['Research Agent', 'Research Agent']);
        expect(starts[0]!.agentId).not.toBe(starts[1]!.agentId);
        expect(starts[1]).not.toHaveProperty('parentAgentId');
        for (const start of starts) expect(r.textOf(start.agentId)).toBe('SUB-CHUNK-1 SUB-CHUNK-2 SUB-CHUNK-3');
        expect(r.reply()).toBe('ROOTTWO-CHUNK-1 ROOTTWO-CHUNK-2 ROOTTWO-CHUNK-3');
    });

    it('shows nothing of a sub-agent whose streaming is off: n8n sends no frame for it', async () => {
        const r = run(fixture('v2.47-stream-sub-agent-not-streaming').body);
        await r.done;
        expect(r.starts()).toEqual([]);
        expect(r.reply()).toBe('ROOT-CHUNK-1 ROOT-CHUNK-2 ROOT-CHUNK-3');
    });

    it('cannot tell a sub-agent from the next agent when its caller wrote before the call, and draws it in the reply as before', async () => {
        const r = run(fixture('v2.47-stream-sub-agent-after-preamble').body);
        await r.done;
        expect(r.starts()).toEqual([]);
        expect(r.reply()).toBe('ROOTPRE-PREAMBLE SUB-CHUNK-1 SUB-CHUNK-2 SUB-CHUNK-3ROOTPRE-CHUNK-1 ROOTPRE-CHUNK-2 ROOTPRE-CHUNK-3');
        expect(r.events.filter((e) => e.type === 'text-flush')).toHaveLength(3);
    });

    it('reads every recording the same whatever pieces the network cuts it into', async () => {
        for (const name of ['v2.47-stream-sub-agent', 'v2.47-stream-sub-agent-nested', 'v2.47-stream-sub-agent-twice']) {
            const whole = run(fixture(name).body);
            const cut = run(byteByByte(fixture(name).body));
            await Promise.all([whole.done, cut.done]);
            const shape = (events: Event[]) => events.map((e) => [e.type, e.delta, e.name, e.agentId === undefined]);
            expect(shape(cut.events)).toEqual(shape(whole.events));
        }
    });
});

describe('an n8n sub-agent streams on a line of its own: what a recording cannot provoke', () => {
    it('draws in the reply the text of a node it took for a sub-agent when the agent before it never streamed again', async () => {
        // Two agents in a row, the first answering nothing: the second is the answer.
        const r = run(frames(
            { type: 'begin', ...meta('a') }, { type: 'end', ...meta('a') },
            { type: 'begin', ...meta('b') }, { type: 'item', content: 'B answers.', ...meta('b') }, { type: 'end', ...meta('b') },
        ));
        await expect(r.done).resolves.toBeUndefined();
        expect(r.reply()).toBe('B answers.');
        expect(r.events.at(-1)).toEqual({ type: 'run-done' });
    });

    it('ends a sub-agent still streaming as failed when the workflow fails', async () => {
        const r = run(frames(
            { type: 'begin', ...meta('a') }, { type: 'end', ...meta('a') },
            { type: 'begin', ...meta('b') }, { type: 'item', content: 'half', ...meta('b') },
            { type: 'error', content: 'model down', ...meta('b') },
        ));
        await expect(r.done).rejects.toThrow('The n8n workflow failed.');
        const [start] = r.starts();
        expect(r.events.filter((e) => e.type === 'agent-end')).toEqual([{ type: 'agent-end', agentId: start!.agentId, status: 'failed', error: 'The n8n workflow failed.' }]);
    });
});
