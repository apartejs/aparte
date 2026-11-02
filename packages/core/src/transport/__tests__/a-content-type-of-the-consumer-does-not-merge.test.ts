// @vitest-environment node
/**
 * The two clients that post to the library's own handlers send `Content-Type: application/json`
 * AND whatever headers the consumer gave. A consumer's `content-type` (another case, so another
 * key) used to travel beside it, and `fetch` joins the two into one header,
 * `application/json, application/json`, which the handlers' content-type check refused with a 415.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { jsonHeaders } from '../json-headers.js';
import { refuseUnsafeRequest } from '../request-guard.js';
import { AparteBackendTransport } from '../backend-transport.js';
import { createAgentStreamRunner } from '../../client/agent-runner.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteStreamRunOptions } from '../../client/stream-adapter.js';

afterEach(() => vi.unstubAllGlobals());

/** What a handler receives for the headers a client passed to `fetch`. */
const received = (init: RequestInit): Request => new Request('http://localhost/api/chat', { method: 'POST', body: '{}', headers: init.headers as HeadersInit });

describe('jsonHeaders', () => {
    it('keeps the consumer\'s headers and sends one application/json content type, whatever its case', () => {
        expect(jsonHeaders({ Authorization: 'Bearer t', 'content-type': 'text/plain', 'CONTENT-TYPE': 'x' })).toEqual({
            Authorization: 'Bearer t', 'Content-Type': 'application/json',
        });
        expect(jsonHeaders()).toEqual({ 'Content-Type': 'application/json' });
    });
});

describe('a consumer that sets its own content-type', () => {
    for (const header of ['content-type', 'Content-type', 'CONTENT-TYPE']) {
        it(`reaches the handler's check as JSON with the backend transport (${header})`, async () => {
            const seen: RequestInit[] = [];
            vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { seen.push(init); return new Response('{"text":"ok"}', { status: 200 }); });
            const transport = new AparteBackendTransport({ endpoint: '/api/chat', headers: { [header]: 'application/json; charset=utf-8' } });
            await transport.chat({ id: 'p' } as unknown as AparteAIProvider, { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: false }, undefined, { providerId: 'p' });
            expect(refuseUnsafeRequest(received(seen[0]!))).toBeNull();
        });

        it(`reaches the handler's check as JSON with the agent runner (${header})`, async () => {
            const seen: RequestInit[] = [];
            const fetch = (async (_url: string, init: RequestInit) => { seen.push(init); return new Response('{"type":"run-done"}\n', { status: 200 }); }) as unknown as typeof globalThis.fetch;
            await createAgentStreamRunner({ endpoint: '/api/agent', fetch, headers: { [header]: 'application/json' } })({
                messageId: 'm', providerId: 'p', baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
                transportCall: async () => '', toolLookup: () => undefined, emitter: () => {}, signal: new AbortController().signal,
            } as unknown as AparteStreamRunOptions);
            expect(refuseUnsafeRequest(received(seen[0]!))).toBeNull();
        });
    }
});
