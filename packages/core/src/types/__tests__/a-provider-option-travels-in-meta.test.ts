import { describe, it, expect } from 'vitest';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteDirectTransport } from '../../transport/direct-transport.js';
import { AparteBackendTransport } from '../../transport/backend-transport.js';
import type { AparteChatRequest } from '../chat.js';

/**
 * `AparteChatRequest` used to declare three provider-specific knobs at its top level —
 * `prefill`, `systemOverride`, `fastStream` — each documented "providers MAY ignore it",
 * and no provider in this repo ever read one. The channel that actually works is `_meta`:
 * an open, namespaced bag core neither filters nor rewrites. This test is the proof, so
 * that the trigger for a raw-completion provider (`provider-llamacpp`) finds a path
 * already open rather than three flat fields to revive.
 */
function harness() {
    const seen: AparteChatRequest[] = [];
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'llamacpp',
        getMetadata: () => ({ id: 'llamacpp', name: 'llama.cpp' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        // A legacy-shaped provider: `AparteDirectTransport` hands it the request verbatim.
        chat: async (request: AparteChatRequest) => { seen.push(request); return ''; },
    } as never);
    cfg.setModelConfig({ defaultProvider: 'llamacpp', defaultModel: 'm' });
    cfg.setKeyProvider(() => '');
    cfg.setTransport(new AparteDirectTransport({ byok: true }));

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    (el as unknown as Record<string, unknown>).getMessages = () => [];
    return { cfg, el, seen };
}

describe('a provider-specific option travels in _meta', () => {
    it('reaches the provider untouched, through the client and AparteDirectTransport', async () => {
        const { cfg, el, seen } = harness();
        const client = new AparteClient({
            config: cfg,
            autoRegister: false,
            targetResolver: () => el as never,
            requestInterceptor: (request) => ({
                ...request,
                _meta: { ...request._meta, llamacpp: { prefill: 'x' } },
            }),
        });

        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'continue' } }),
        );

        const meta = seen[0]?._meta?.['llamacpp'] as { prefill?: string } | undefined;
        expect(meta?.prefill, 'core neither filters nor rewrites the bag').toBe('x');
    });

    it('and rides the default body of the backend transport, so the field says so instead of promising a strip', async () => {
        const bodies: string[] = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
            bodies.push(init.body);
            return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
        }) as typeof fetch;
        try {
            const transport = new AparteBackendTransport({ endpoint: '/api/chat' });
            await transport.chat(
                undefined as never,
                { messages: [], modelId: 'm', stream: false, _meta: { llamacpp: { prefill: 'x' } } },
                undefined,
                { providerId: 'llamacpp' } as never,
            );
        } finally {
            globalThis.fetch = realFetch;
        }

        const sent = JSON.parse(bodies[0] ?? '{}') as { request?: { _meta?: Record<string, unknown> } };
        expect(sent.request?._meta, 'the default body carries the bag to your endpoint').toEqual({ llamacpp: { prefill: 'x' } });
    });

    it('and the three flat knobs no consumer read are gone from the request', () => {
        const request: AparteChatRequest = { messages: [], modelId: 'm' };
        // @ts-expect-error — removed: a provider reads its own option off `_meta`.
        request.prefill = 'x';
        // @ts-expect-error — removed: build the system message in your provider or a `history:` function.
        request.systemOverride = 'you are';
        // @ts-expect-error — removed: no provider ever read it.
        request.fastStream = true;
        expect(Object.keys(request)).toEqual(['messages', 'modelId', 'prefill', 'systemOverride', 'fastStream']);
    });
});
