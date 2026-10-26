/**
 * loadN8nHistory — a session's messages read back from the workflow's memory.
 *
 * The `v2.44-history*` fixtures are what a live n8n 2.44.6 answered `loadPreviousSession`,
 * byte for byte, after real turns with a model: a plain exchange, a turn that ran the
 * calculator, a session with no messages, and a trigger whose memory was not connected.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AparteError, AparteErrorCode } from '@aparte/core';
import { loadN8nHistory, n8nHistoryToMessages } from '../index.js';

interface Recorded { status: number; contentType: string; body: string }

const fixture = (name: string): Recorded =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Recorded;

function fakeFetch(recorded: Recorded | Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return recorded instanceof Response ? recorded : new Response(recorded.body, { status: recorded.status, headers: { 'content-type': recorded.contentType } });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

const URL_ = 'https://n8n.example.com/webhook/abc/chat';

describe('loadN8nHistory', () => {
    it('asks for the session as the widget does, and returns what the person wrote and what the agent answered', async () => {
        const { fetch, calls } = fakeFetch(fixture('v2.44-history'));
        const messages = await loadN8nHistory({ webhookUrl: URL_, sessionId: 'rec-3', fetch, metadata: { page: '/' } });
        expect(calls[0]!.init.method).toBe('POST');
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ action: 'loadPreviousSession', sessionId: 'rec-3', metadata: { page: '/' } });
        expect(messages.map((m) => [m.role, m.content])).toEqual([
            ['user', 'Hi, I am Paul. Do you have gluten-free bread?'],
            ['assistant', 'Hello Paul! Yes, we do offer a selection of gluten-free bread. Would you like to see our current options?'],
        ]);
        expect(messages.every((m) => m.status === 'completed')).toBe(true);
        expect(messages[0]!.timestamp).toBeLessThan(messages[1]!.timestamp);
        expect(new Set(messages.map((m) => m.id)).size).toBe(2);
    });

    it("leaves out a tool's call and its result, which n8n's widget drew as raw JSON after a reload", async () => {
        const messages = await loadN8nHistory({ webhookUrl: URL_, sessionId: 'rec-7', fetch: fakeFetch(fixture('v2.44-history-tool')).fetch });
        expect(messages.map((m) => [m.role, m.content])).toEqual([
            ['user', 'What is 12 times 7.5? Use the calculator.'],
            ['assistant', '12 times 7.5 is 90.'],
        ]);
    });

    it('returns no messages for a session n8n has never seen', async () => {
        expect(await loadN8nHistory({ webhookUrl: URL_, sessionId: 'new', fetch: fakeFetch(fixture('v2.44-history-empty')).fetch })).toEqual([]);
    });

    it('says to connect the memory to the trigger when n8n cannot start the history request', async () => {
        const error = await loadN8nHistory({ webhookUrl: URL_, sessionId: 's', fetch: fakeFetch(fixture('v2.44-history-memory-not-on-trigger')).fetch }).catch((e: unknown) => e) as AparteError;
        expect(error).toBeInstanceOf(AparteError);
        expect(error.message).toMatch(/connect the memory node to the Chat Trigger as well as to the agent/);
        expect(error.httpStatus).toBe(500);
    });

    it('names the session field, sends headers and credentials, and passes the signal', async () => {
        const { fetch, calls } = fakeFetch(fixture('v2.44-history-empty'));
        const signal = new AbortController().signal;
        await loadN8nHistory({ webhookUrl: URL_, sessionId: 's', fetch, chatSessionKey: 'conversation', headers: async () => ({ authorization: 'Bearer t' }), credentials: 'include', signal });
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ action: 'loadPreviousSession', conversation: 's' });
        expect(calls[0]!.init.headers).toEqual({ 'Content-Type': 'application/json', authorization: 'Bearer t' });
        expect(calls[0]!.init.credentials).toBe('include');
        expect(calls[0]!.init.signal).toBe(signal);
    });

    it('fails clearly on an answer that is not JSON', async () => {
        const fetch = fakeFetch(new Response('<p>hello</p>', { status: 200 })).fetch;
        await expect(loadN8nHistory({ webhookUrl: URL_, sessionId: 's', fetch })).rejects.toThrow(/not JSON/);
        // A wrong URL: set up so it cannot answer, as the runner says it.
        await expect(loadN8nHistory({ webhookUrl: URL_, sessionId: 's', fetch: fakeFetch(new Response('<p>hello</p>', { status: 200 })).fetch }))
            .rejects.toMatchObject({ code: AparteErrorCode.PROVIDER_MISCONFIGURED });
    });

    it('reads no messages from a body without a data list', async () => {
        for (const body of ['{"ok":true}', 'null']) {
            const fetch = fakeFetch(new Response(body, { status: 200 })).fetch;
            expect(await loadN8nHistory({ webhookUrl: URL_, sessionId: 's', fetch })).toEqual([]);
        }
    });

    it('uses the global fetch when given none', async () => {
        const { fetch, calls } = fakeFetch(fixture('v2.44-history-empty'));
        vi.stubGlobal('fetch', fetch);
        try {
            await loadN8nHistory({ webhookUrl: URL_, sessionId: 's' });
        } finally {
            vi.unstubAllGlobals();
        }
        expect(calls).toHaveLength(1);
    });
});

describe('n8nHistoryToMessages', () => {
    it('reads the short message types, content lists, and skips what is not a message', () => {
        const messages = n8nHistoryToMessages([
            { type: 'human', kwargs: { content: 'hi' } },
            { type: 'ai', kwargs: { content: [{ type: 'text', text: 'Hello' }, 'there', { type: 'image_url' }] } },
            { id: ['langchain_core', 'messages', 'SystemMessage'], kwargs: { content: 'rules' } },
            { id: ['langchain_core', 'messages', 'AIMessage'], kwargs: { content: '   ' } },
            { id: ['langchain_core', 'messages', 'AIMessage'], kwargs: { content: 42 } },
            { kwargs: { content: 'no class' } },
            null,
            'loose text',
        ], { now: 1000 });
        expect(messages).toEqual([
            { id: 'n8n-0', role: 'user', content: 'hi', timestamp: 992, status: 'completed' },
            { id: 'n8n-1', role: 'assistant', content: 'Hello\n\nthere', timestamp: 993, status: 'completed' },
        ]);
    });
});
