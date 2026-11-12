/**
 * A scripted AG-UI wire for the sub-agent suites: each response a fake `fetch` serves is
 * one SSE body, and `turn` reads what the runner hands the client's adapter.
 */
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';
import type { AgUiRunnerOptions } from '../index.js';

export type Event = { type: string; [key: string]: unknown };

export const sse = (...events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

/** A fake `fetch` that serves `responses` in order and keeps every request body. */
export function scripted(...responses: Response[]) {
    const bodies: Record<string, unknown>[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        const next = responses.shift();
        if (!next) throw new Error('no scripted response left');
        return next;
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies };
}

/** One run of `runner` (made once per test, so a thread's state carries over), with what it emitted and how it ended. */
export async function turn(
    runner: ReturnType<typeof createAgUiRunner>,
    extra: Partial<AparteStreamRunOptions> = {},
): Promise<{ events: Event[]; error: unknown }> {
    const events: Event[] = [];
    let error: unknown;
    try {
        await runner({
            messageId: 'm1',
            providerId: 'agent',
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
            transportCall: async () => { throw new Error('never called'); },
            toolLookup: () => undefined,
            emitter: (e: Event) => events.push(e),
            signal: new AbortController().signal,
            ...extra,
        } as unknown as AparteStreamRunOptions);
    } catch (e) {
        error = e;
    }
    return { events, error };
}

export function agUi(fetch: typeof globalThis.fetch, options: Partial<AgUiRunnerOptions> = {}) {
    return createAgUiRunner({ endpoint: '/agui', fetch, onWarning: () => {}, ...options });
}

export const started = (runId = 'r1', threadId = 't') => ({ type: 'RUN_STARTED', threadId, runId });
export const finished = (extra: object = {}, runId = 'r1', threadId = 't') => ({ type: 'RUN_FINISHED', threadId, runId, ...extra });
