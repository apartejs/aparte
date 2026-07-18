/**
 * Deterministic network mock for the OpenAI-compatible model API.
 *
 * The playgrounds wire a REAL pipeline (`createOpenAICompatProvider` →
 * `DirectTransport` → `AparteClient`). We do NOT touch that wiring — instead we
 * intercept the only two calls that leave the browser and answer them from
 * here, so the E2E is fast, offline, and identical on every machine:
 *
 *   GET  {baseURL}/models            → the model list the selector populates from
 *   POST {baseURL}/chat/completions  → a canned SSE stream the bubbles render
 *
 * The POST body is CAPTURED (see {@link LlmMock.lastChatRequest}) so a test can
 * assert the real request half ran — the auto-selected model id and the typed
 * message actually reached the transport, not just the canned response coming
 * back. The glob matches any host (LM Studio :1234, Ollama :11434, OpenRouter…),
 * so every provider the playgrounds register resolves to the same fixture.
 */

import type { Page, Route } from '@playwright/test';

/** Substring guaranteed to appear in the rendered assistant reply. */
export const MOCK_REPLY_MARK = 'aparte e2e mock';

/** The model id the selector auto-selects (single canned model). */
export const MOCK_MODEL_ID = 'aparte-e2e-model';

const modelsBody = (empty: boolean): string =>
    JSON.stringify({ data: empty ? [] : [{ id: MOCK_MODEL_ID, name: 'Aparte E2E Model', context_length: 8192 }] });

// A markdown-flavored reply: the `**bold**` proves the marked plugin runs, and
// the trailing line adds height so a handful of turns overflows the viewport.
// Split into small events — the parser reassembles them from one buffered body
// (this is not inter-token pacing; it exercises multi-event SSE parsing + append
// ORDER, not progressive/streamed rendering timing).
const REPLY_CHUNKS = [
    'Hello', ' from', ' the', ' **aparte', ' e2e', ' mock**.',
    ' This', ' is', ' a', ' second', ' line', ' that', ' adds', ' vertical', ' height.',
];

/** Build an OpenAI-compatible SSE body from the canned chunks. */
function chatSseBody(): string {
    const events = REPLY_CHUNKS.map(
        (c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`,
    );
    events.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    // usage-only chunk — a real compat server emits this under stream_options.include_usage.
    events.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 } })}\n\n`);
    events.push('data: [DONE]\n\n');
    return events.join('');
}

const CORS_HEADERS: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    // Include the concrete headers a keyed provider would send (Authorization),
    // not only `*` — the fetch spec does not let `*` cover Authorization.
    'access-control-allow-headers': 'authorization, content-type, *',
};

async function fulfill(route: Route, body: string, contentType: string): Promise<void> {
    // Answer the CORS pre-flight the browser sends before a cross-origin POST
    // with a JSON content-type (and any GET carrying an auth header).
    if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
        return;
    }
    await route.fulfill({ status: 200, headers: { ...CORS_HEADERS, 'content-type': contentType }, body });
}

/** Handle returned by {@link installLlmMock} for asserting the request half. */
export interface LlmMock {
    /** Chat-completions request bodies captured in order. */
    readonly chatRequests: Record<string, unknown>[];
    /** The most recent chat-completions request body, or null if none yet. */
    lastChatRequest(): Record<string, unknown> | null;
}

/**
 * Install the model-API mock on a page. Call BEFORE `page.goto` so the
 * selector's on-connect `GET /models` is already intercepted. Pass
 * `{ emptyModels: true }` to return an empty model list (nothing auto-selects →
 * the require-model gate stays shut — for the gate-blocks-send test).
 */
export async function installLlmMock(page: Page, opts: { emptyModels?: boolean } = {}): Promise<LlmMock> {
    const chatRequests: Record<string, unknown>[] = [];

    await page.route('**/models', (route) => fulfill(route, modelsBody(!!opts.emptyModels), 'application/json'));
    await page.route('**/chat/completions', (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown> | null;
            if (body) chatRequests.push(body);
        }
        return fulfill(route, chatSseBody(), 'text/event-stream');
    });

    return { chatRequests, lastChatRequest: () => chatRequests.at(-1) ?? null };
}
