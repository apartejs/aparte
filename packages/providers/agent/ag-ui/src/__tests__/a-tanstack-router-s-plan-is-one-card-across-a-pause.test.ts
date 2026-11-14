// @vitest-environment jsdom
/**
 * A TanStack AI router's plan, through a pause, on a page: the AG-UI runner, core's client
 * and a real viewport, against TanStack's real server. The router runs two sub-agents, one of
 * which pauses for an approval; the client asks, then resumes the reply in a NEW run — and a
 * new stream adapter. The runner carries the plan's id across the pause, so the resumed run
 * patches the card the paused run drew: the reply holds ONE plan card, ticked to the end.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { chat, chatParamsFromRequest, defineAgent, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';
import { AparteClient, AparteConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

// The page: core's browser entry, its elements defined — this package's tests otherwise read
// the Node entry, which defines none. The runner reads the same module.
vi.mock('@aparte/core', async () => await import('../../../../../core/src/index.js'));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const deleteFile = toolDefinition({
    name: 'delete_file',
    description: 'Delete a file.',
    needsApproval: true,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
}).server(async (input: unknown) => `deleted ${(input as { path: string }).path}`);

const listFiles = toolDefinition({
    name: 'list_files',
    description: 'List the files.',
    inputSchema: { type: 'object', properties: {} },
}).server(async () => 'a.txt, b.txt');

const child = (name: string, tool: typeof deleteFile, answer: string) => defineAgent({
    name,
    description: `The ${name}.`,
    run: (ctx) => {
        const fake = fakeText();
        fake.setResponses(ctx.resume ? [{ text: answer }] : [{ toolCalls: [{ name: tool.name, input: { path: '/tmp/x' } }] }, { text: answer }]);
        return chat({ adapter: fake, messages: ctx.messages, tools: [tool], ...ctx.forward });
    },
});

const route = (async (_url: string, init: RequestInit) => {
    const params = await chatParamsFromRequest(new Request('http://localhost/api/chat', { method: 'POST', body: init.body as string }));
    const main = fakeText();
    main.setResponses([{ text: 'Both are done.' }]);
    const stream = chat({
        adapter: main,
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        ...(params.resume ? { resume: params.resume } : {}),
        subagents: {
            agents: [child('lister', listFiles, 'Two files.'), child('cleaner', deleteFile, 'Deleted it.')],
            router: () => ({ steps: [{ names: ['lister', 'cleaner'], order: 'parallel' as const }] }),
            strategy: 'handoff' as const,
        },
    } as never);
    return toServerSentEventsResponse(stream as never);
}) as unknown as typeof globalThis.fetch;

afterEach(() => { document.body.innerHTML = ''; });

describe('a TanStack router’s plan is one card across a pause', () => {
    it('draws one plan card on the reply, paused then resumed, ticked to the end', async () => {
        const viewport = document.createElement('aparte-chat-viewport') as HTMLElement & { getMessages(): AparteMessage[] };
        viewport.id = 'chat';
        document.body.appendChild(viewport);
        await vi.waitFor(() => expect(typeof viewport.getMessages).toBe('function'));

        const config = new AparteConfig();
        config.registerAIProvider({ id: 'agent', getMetadata: () => ({ id: 'agent', name: 'Agent' }), getModels: () => [{ id: 'x', name: 'X' }], chat: async () => '' } as never);
        config.setModelConfig({ defaultProvider: 'agent', defaultModel: 'x' });
        let asked = 0;
        const client = new AparteClient({
            config, autoRegister: false, targetResolver: () => viewport as never,
            streamRunner: createAgUiRunner({ endpoint: '/api/chat', fetch: route, threadId: 'conv-1', relaxedRunFraming: true, onWarning: () => {} }),
            approvalResolver: async () => { asked++; return { approved: true }; },
        } as never);
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content: 'Tidy up.' } }));

        const reply = viewport.getMessages().at(-1)!;
        expect(asked).toBe(1);
        expect(reply.status).toBe('completed');
        const cards = (reply.segments ?? []).filter((s: AparteSegment) => s.type === 'activity');
        expect(cards).toHaveLength(1);
        expect((cards[0] as { content: { steps: Array<{ title: string; status: string }> } }).content.steps.map((s) => `${s.title}:${s.status}`))
            .toEqual(['lister:done', 'cleaner:done']);
    });
});
