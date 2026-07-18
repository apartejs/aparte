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
 * The glob matches any host (LM Studio :1234, Ollama :11434, OpenRouter…), so
 * every provider the playgrounds register resolves to the same fixture. CORS
 * headers + a 204 for the pre-flight let the cross-origin `fetch()` succeed
 * exactly as it would against a real server.
 */

import type { Page, Route } from '@playwright/test';

/** Substring guaranteed to appear in the rendered assistant reply. */
export const MOCK_REPLY_MARK = 'aparte e2e mock';

/** The provider id/name the selector auto-selects (single canned model). */
const MODELS_BODY = JSON.stringify({
    data: [{ id: 'aparte-e2e-model', name: 'Aparte E2E Model', context_length: 8192 }],
});

// A markdown-flavored reply: the `**bold**` proves the marked plugin runs, and
// the trailing line adds height so a handful of turns overflows the viewport
// (the scroll regression). Split into small chunks to mimic real token streaming.
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
    events.push('data: [DONE]\n\n');
    return events.join('');
}

const CORS_HEADERS: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
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

/**
 * Install the model-API mock on a page. Call BEFORE `page.goto` so the
 * selector's on-connect `GET /models` is already intercepted.
 */
export async function installLlmMock(page: Page): Promise<void> {
    await page.route('**/models', (route) => fulfill(route, MODELS_BODY, 'application/json'));
    await page.route('**/chat/completions', (route) => fulfill(route, chatSseBody(), 'text/event-stream'));
}
