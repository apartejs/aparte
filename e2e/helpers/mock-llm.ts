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
 *
 * **Scenarios.** One canned happy-path reply only ever exercised plain markdown,
 * which is why no segment renderer, no error path and no mid-stream state had any
 * browser coverage. Pass `{ scenario }` to pick the wire behaviour instead — the
 * shapes below mirror what `openai-compat` actually parses (`delta.content`,
 * `delta.reasoning_content`, `delta.tool_calls` + `finish_reason: 'tool_calls'`).
 *
 * Note on pacing: `route.fulfill` delivers a body atomically, so scenarios don't
 * emit tokens progressively. What they DO control is when the response starts —
 * `slow` holds the request open, which is the window where the bubble is pending
 * / streaming, the send button shows stop, and cancel can be exercised.
 */

import type { Page, Route } from '@playwright/test';

/** Substring guaranteed to appear in the rendered assistant reply. */
export const MOCK_REPLY_MARK = 'aparte e2e mock';

/** The model id the selector auto-selects (single canned model). */
export const MOCK_MODEL_ID = 'aparte-e2e-model';

/** Marks in the scenario fixtures, so specs assert on a constant not a literal. */
export const MOCK_THINKING_MARK = 'weighing the options';
export const MOCK_CODE_MARK = 'aparteCodeFixture';
export const MOCK_TOOL_NAME = 'e2e_echo';

/** A model id carrying characters that break a naive attribute selector. */
export const MOCK_HOSTILE_MODEL_ID = 'a"b]c-model';

export interface MockModel {
    id: string;
    name?: string;
    context_length?: number;
}

const DEFAULT_MODELS: MockModel[] = [{ id: MOCK_MODEL_ID, name: 'Aparte E2E Model', context_length: 8192 }];

/**
 * Wire behaviours a spec can ask for.
 *
 * - `text` — the default markdown reply (bold + a second line for height)
 * - `thinking` — `reasoning_content` deltas, then text: a thinking segment
 * - `code` — a fenced block: the code segment, its header and copy button
 * - `tool-call` — a streamed tool call the app's registered tool answers
 * - `slow` — response held open (see `delayMs`): pending/streaming/stop/cancel
 * - `http-500` — vendor error status: the error segment + recovery
 * - `malformed-sse` — unparseable events: must degrade, not crash
 * - `empty-stream` — 200 with no content at all: an empty completed turn
 */
export type LlmScenario =
    | 'text'
    | 'thinking'
    | 'code'
    | 'tool-call'
    | 'slow'
    | 'http-500'
    | 'malformed-sse'
    | 'empty-stream';

export interface LlmMockOptions {
    /** Return an empty model list → nothing auto-selects, the gate stays shut. */
    emptyModels?: boolean;
    /** Wire behaviour for `POST /chat/completions`. Default `'text'`. */
    scenario?: LlmScenario;
    /** Model list to serve (for multi-model / hostile-id coverage). */
    models?: MockModel[];
    /** How long `scenario: 'slow'` holds the response. Default 2000ms. */
    delayMs?: number;
}

// A markdown-flavored reply: the `**bold**` proves the marked plugin runs, and
// the trailing line adds height so a handful of turns overflows the viewport.
// Split into small events — the parser reassembles them from one buffered body
// (this is not inter-token pacing; it exercises multi-event SSE parsing + append
// ORDER, not progressive/streamed rendering timing).
const REPLY_CHUNKS = [
    'Hello', ' from', ' the', ' **aparte', ' e2e', ' mock**.',
    ' This', ' is', ' a', ' second', ' line', ' that', ' adds', ' vertical', ' height.',
];

const sse = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;
const contentEvent = (content: string): string => sse({ choices: [{ index: 0, delta: { content } }] });
const thinkingEvent = (reasoning_content: string): string =>
    sse({ choices: [{ index: 0, delta: { reasoning_content } }] });
const finishEvent = (reason = 'stop'): string =>
    sse({ choices: [{ index: 0, delta: {}, finish_reason: reason }] });
// usage-only chunk — a real compat server emits this under stream_options.include_usage.
const usageEvent = (): string =>
    sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 } });
const DONE = 'data: [DONE]\n\n';

function bodyForScenario(scenario: LlmScenario): string {
    switch (scenario) {
        case 'thinking':
            return [
                thinkingEvent('Let me start by '),
                thinkingEvent(MOCK_THINKING_MARK),
                thinkingEvent('.'),
                ...REPLY_CHUNKS.map(contentEvent),
                finishEvent(), usageEvent(), DONE,
            ].join('');

        case 'code':
            return [
                contentEvent('Here is the snippet:\n\n'),
                contentEvent('```ts\n'),
                contentEvent(`export const ${MOCK_CODE_MARK} = 42;\n`),
                contentEvent('```\n'),
                contentEvent('\nThat is all.'),
                finishEvent(), usageEvent(), DONE,
            ].join('');

        case 'tool-call':
            return [
                contentEvent('Calling a tool.'),
                sse({
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_e2e_1',
                                function: { name: MOCK_TOOL_NAME, arguments: '' },
                            }],
                        },
                    }],
                }),
                sse({
                    choices: [{
                        index: 0,
                        delta: { tool_calls: [{ index: 0, function: { arguments: '{"value":"ping"}' } }] },
                    }],
                }),
                finishEvent('tool_calls'),
                DONE,
            ].join('');

        case 'malformed-sse':
            // Unparseable payloads plus a truncated event: the reader must not throw.
            return ['data: {this is not json}\n\n', 'data: {"choices":\n\n', DONE].join('');

        case 'empty-stream':
            return [finishEvent(), DONE].join('');

        case 'text':
        case 'slow':
        case 'http-500':
        default:
            return [...REPLY_CHUNKS.map(contentEvent), finishEvent(), usageEvent(), DONE].join('');
    }
}

const CORS_HEADERS: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    // Include the concrete headers a keyed provider would send (Authorization),
    // not only `*` — the fetch spec does not let `*` cover Authorization.
    'access-control-allow-headers': 'authorization, content-type, *',
};

/** True when this is the CORS pre-flight, which is answered and consumed here. */
async function handledPreflight(route: Route): Promise<boolean> {
    if (route.request().method() !== 'OPTIONS') return false;
    await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
    return true;
}

async function fulfill(route: Route, body: string, contentType: string, status = 200): Promise<void> {
    if (await handledPreflight(route)) return;
    await route.fulfill({ status, headers: { ...CORS_HEADERS, 'content-type': contentType }, body });
}

/** Handle returned by {@link installLlmMock} for asserting the request half. */
export interface LlmMock {
    /** Chat-completions request bodies captured in order. */
    readonly chatRequests: Record<string, unknown>[];
    /** The most recent chat-completions request body, or null if none yet. */
    lastChatRequest(): Record<string, unknown> | null;
    /** The scenario this mock is serving. */
    readonly scenario: LlmScenario;
}

/**
 * Install the model-API mock on a page. Call BEFORE `page.goto` so the
 * selector's on-connect `GET /models` is already intercepted.
 */
export async function installLlmMock(page: Page, opts: LlmMockOptions = {}): Promise<LlmMock> {
    const scenario: LlmScenario = opts.scenario ?? 'text';
    const chatRequests: Record<string, unknown>[] = [];
    const models = opts.emptyModels ? [] : (opts.models ?? DEFAULT_MODELS);
    const delayMs = opts.delayMs ?? 2000;

    await page.route('**/models', (route) => fulfill(route, JSON.stringify({ data: models }), 'application/json'));

    await page.route('**/chat/completions', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown> | null;
            if (body) chatRequests.push(body);
        }

        if (scenario === 'http-500') {
            await fulfill(route, JSON.stringify({ error: { message: 'e2e injected vendor failure' } }), 'application/json', 500);
            return;
        }

        if (scenario === 'slow') {
            if (await handledPreflight(route)) return;
            // Hold the response open: the turn stays in flight, which is the only
            // window where mid-stream UI (streaming flags, stop button, cancel)
            // can be observed. Playwright aborts the route if the test ends first.
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        await fulfill(route, bodyForScenario(scenario), 'text/event-stream');
    });

    return { chatRequests, lastChatRequest: () => chatRequests.at(-1) ?? null, scenario };
}
