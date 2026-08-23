/**
 * Deterministic network mock for the OpenAI-compatible model API.
 *
 * The examples wire a REAL pipeline (`createOpenAICompatProvider` →
 * `AparteDirectTransport` → `AparteClient`). We do NOT touch that wiring — instead we
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
 * so every provider the examples register resolves to the same fixture.
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

/**
 * The reasoning arrives in three deltas, and the block must end up holding their
 * concatenation EXACTLY — no chunk repeated. Exported as one derived string so a
 * spec can assert the whole text instead of a substring: a substring assertion is
 * what let a duplicated-chunk bug ship (every chunk landed twice, and
 * `toContainText(MOCK_THINKING_MARK)` was still true).
 */
const THINKING_CHUNKS = ['Let me start by ', MOCK_THINKING_MARK, '.'];
export const MOCK_THINKING_FULL = THINKING_CHUNKS.join('');
export const MOCK_CODE_MARK = 'aparteCodeFixture';
export const MOCK_TOOL_NAME = 'e2e_echo';

/**
 * The `ask-question` scenario calls the REAL tool `@aparte/plugin-ask-question`
 * registers, not a fixture of our own — the point is to drive the actual
 * `requestUserInput` path that `<aparte-elicitation>` answers.
 */
export const MOCK_ASK_TOOL_NAME = 'ask_question';
/** The question text the scenario asks, so a spec asserts a constant. */
export const MOCK_ASK_QUESTION = 'Which engine should the workbench use?';
/** The two options offered, in order. */
export const MOCK_ASK_OPTIONS = ['Chromium', 'WebKit'] as const;

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
 * - `ask-question` — calls the real `ask_question` tool, which SUSPENDS the turn
 *   on `requestUserInput` until a presenter shows a panel and it is answered
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
    | 'ask-question'
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
    /**
     * Milliseconds between SSE events — REAL progressive delivery.
     *
     * Without this, `route.fulfill` hands the whole body over at once, so nothing
     * in the browser ever observed a reply arriving over time: incremental markdown
     * re-parse, mid-stream re-highlight, scroll-follow under mutation pressure and
     * "Stop keeps the text already on screen" had no coverage at all, in the one
     * suite that runs a real engine.
     *
     * When set, the response is delivered by a `fetch` shim inside the page instead
     * of by Playwright's router, because a fulfil cannot be streamed. Everything
     * above `fetch` — provider, transport, client, renderers — is still the real
     * pipeline, which is what these tests are about. The trade-off, stated: the
     * route interceptor proves a request LEFT the browser; the shim proves the same
     * body reached the shim. Request capture works either way.
     */
    pace?: number;
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

/**
 * The same body `bodyForScenario` serves, split back into individual SSE frames.
 *
 * Derived from the joined string rather than rebuilt per scenario on purpose: a
 * paced run and a buffered run then differ ONLY in timing, which is the variable
 * under test. Every frame the builders emit already ends in a blank line.
 */
function eventsForScenario(scenario: LlmScenario): string[] {
    const body = bodyForScenario(scenario);
    const TERM = '\n\n';
    return body.split(TERM).filter(Boolean).map(frame => frame + TERM);
}

function bodyForScenario(scenario: LlmScenario): string {
    switch (scenario) {
        case 'thinking':
            return [
                ...THINKING_CHUNKS.map(thinkingEvent),
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

        /**
         * A tool call the model cannot answer on its own: `ask_question` suspends
         * the turn on `requestUserInput`, which only resolves once a presenter has
         * shown a panel and the user has answered it.
         *
         * That is the whole path the instance-config bug broke — under every
         * wrapper, `<aparte-elicitation>` registered on the global singleton while
         * the tool handler resolved the chat's own config, found no presenter, and
         * answered the model `cancel`. Nothing was ever shown, and nothing in the
         * browser suite could see it, because no example wired the two together.
         */
        case 'ask-question':
            return [
                contentEvent('Let me check with you.'),
                sse({
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_e2e_ask_1',
                                function: { name: MOCK_ASK_TOOL_NAME, arguments: '' },
                            }],
                        },
                    }],
                }),
                sse({
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: 0,
                                function: {
                                    arguments: JSON.stringify({
                                        question: MOCK_ASK_QUESTION,
                                        options: MOCK_ASK_OPTIONS.map((title) => ({ title })),
                                    }),
                                },
                            }],
                        },
                    }],
                }),
                finishEvent('tool_calls'),
                usageEvent(),
                DONE,
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
                // Real `include_usage` servers send usage AFTER the finish chunk —
                // including on tool-call turns, which is where the provider used to
                // stop reading and lose it.
                usageEvent(),
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


/**
 * Deliver `POST **\/chat/completions` from inside the page, one SSE event at a
 * time, `pace` ms apart.
 *
 * `route.fulfill` cannot stream a body, so progressive arrival has to come from
 * somewhere the page can pull from lazily. This shims `window.fetch` for that one
 * URL and returns a `Response` whose body is a `ReadableStream` that enqueues on a
 * timer — real backpressure, real `reader.read()` boundaries in the client loop.
 *
 * Installed as an init script so it is in place before any app code runs.
 */
async function installPacedChatStream(page: Page, events: string[], pace: number): Promise<void> {
    await page.addInitScript(
        ({ events: sse, pace: gap }: { events: string[]; pace: number }) => {
            const captured: unknown[] = [];
            (window as unknown as { __apartePacedRequests: unknown[] }).__apartePacedRequests = captured;

            const real = window.fetch.bind(window);
            window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                if (!url.includes('/chat/completions')) return real(input as RequestInfo, init);

                const bodyText = typeof init?.body === 'string' ? init.body : null;
                if (bodyText) { try { captured.push(JSON.parse(bodyText)); } catch { /* not JSON */ } }

                const signal = init?.signal ?? null;
                const encoder = new TextEncoder();
                const stream = new ReadableStream<Uint8Array>({
                    async start(controller) {
                        for (const event of sse) {
                            if (signal?.aborted) {
                                controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                                return;
                            }
                            controller.enqueue(encoder.encode(event));
                            await new Promise(r => setTimeout(r, gap));
                        }
                        controller.close();
                    },
                });
                return new Response(stream, {
                    status: 200,
                    headers: { 'content-type': 'text/event-stream' },
                });
            };
        },
        { events, pace },
    );
}

/** Handle returned by {@link installLlmMock} for asserting the request half. */
export interface LlmMock {
    /** Chat-completions request bodies captured in order. */
    readonly chatRequests: Record<string, unknown>[];
    /** The most recent chat-completions request body, or null if none yet. */
    lastChatRequest(): Record<string, unknown> | null;
    /**
     * Request bodies captured by the PACED path, read out of the page.
     *
     * A separate accessor rather than folding it into `chatRequests`: the paced
     * path answers inside the page, so reading it is asynchronous, and making the
     * synchronous getter async would touch every existing spec.
     */
    pacedRequests(): Promise<Record<string, unknown>[]>;
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

    // Paced delivery is answered inside the page (a fulfil cannot stream), so the
    // chat route below is not installed for it — the shim owns that URL.
    const paced = opts.pace !== undefined;
    if (paced) await installPacedChatStream(page, eventsForScenario(scenario), opts.pace ?? 40);


    if (!paced) await page.route('**/chat/completions', async (route) => {
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

        /**
         * A tool-call turn is not the whole exchange. The client runs the handler,
         * appends the result, and asks again — so a scenario that answers every
         * request with the same tool call loops until `maxTurns`.
         *
         * `ask-question` therefore answers the FIRST request with the call and
         * every later one with plain text. That is what a real model does, and it
         * lets a spec follow the whole path: the panel appears, the user answers,
         * the answer reaches the model, a reply lands. Asserting only that a panel
         * appeared would have left the half that actually resolves the turn
         * untested.
         *
         * `tool-call` keeps its old shape: no spec consumes it today, and changing
         * a fixture nobody reads is churn.
         */
        if (scenario === 'ask-question' && chatRequests.length > 1) {
            await fulfill(route, bodyForScenario('text'), 'text/event-stream');
            return;
        }

        await fulfill(route, bodyForScenario(scenario), 'text/event-stream');
    });

    // Paced runs capture in the page, so the handle reads from there. `async` on
    // both would be a wider change than this earns; the paced getter is separate.
    return {
        chatRequests,
        lastChatRequest: () => chatRequests.at(-1) ?? null,
        pacedRequests: () => page.evaluate(
            () => (window as unknown as { __apartePacedRequests?: unknown[] }).__apartePacedRequests ?? [],
        ) as Promise<Record<string, unknown>[]>,
        scenario,
    };
}
