/**
 * @aparte/provider-scenario — a scripted model.
 *
 * An `AparteAIProvider` that REPLAYS turns you wrote instead of calling a model: text at
 * a typing pace, thinking, tool calls (the real loop runs your handler and calls back
 * with the result), errors, pauses. No key, no network, no randomness.
 *
 * Three things in this repository had written it by hand before this package existed:
 * the e2e mock of the wire, the screenshot harness of the UI audit, and the docs frames
 * that seed content. It is also the piece nobody ships for CONSUMERS: a deterministic
 * model for their own tests, and a demo that streams without a backend.
 *
 * It owns its I/O — `chat()` — so `AparteDirectTransport` hands the request straight to
 * it; there is no wire format here to adapt. (This repository's own e2e keeps its
 * network mock on purpose: that suite tests the real wire path, which this provider
 * bypasses by construction.)
 *
 * ```ts
 * import { createScenarioProvider } from '@aparte/provider-scenario';
 * aparteGlobalConfig.registerAIProvider(createScenarioProvider({
 *   turns: ['Hello! Ask me anything.', [{ thinking: 'Let me see…' }, { text: 'Here is my answer.' }]],
 * }));
 * ```
 */

import type {
    AparteAIModel,
    AparteAIProvider,
    AparteChatMessage,
    AparteChatRequest,
    AparteChatResponse,
    AparteStreamEvent,
    AparteUsage,
} from '@aparte/core';

// ─── What a turn is made of ──────────────────────────────────────────────────

/** One thing the scripted model does, in order. */
export type ScenarioStep =
    /** Stream this text, chunk by chunk at the configured pace. Markdown and `<artifact>` tags are fine: core parses them. */
    | { text: string }
    /** Stream this as reasoning (the thinking block). */
    | { thinking: string }
    /** Call a tool. The loop runs the registered handler, then calls the provider again with the result. */
    | { tool: string; input?: Record<string, unknown>; id?: string }
    /** Fail the turn with this message — what a provider error looks like to the UI. */
    | { error: string }
    /** Pause, in milliseconds — a slow model, a long tool. */
    | { wait: number }
    /** Override the usage reported at the end (merged over the estimate). */
    | { usage: Partial<AparteUsage> };

/** What the model does for ONE call. A bare string is one text step. */
export type ScenarioTurn = string | ScenarioStep[];

/** A turn with the conditions under which it answers. */
export interface Scenario {
    /**
     * Answers when the last user message matches: a string is a case-insensitive
     * substring, a RegExp is tested as is.
     */
    when?: string | RegExp;
    /** Answers the call that follows this tool's result — the second half of a tool round-trip. */
    after?: string;
    turn: ScenarioTurn;
}

/** How fast text streams. */
export interface ScenarioPacing {
    /** Characters per chunk. Default 12. */
    chunk?: number;
    /** Milliseconds between chunks. Default 24. */
    delay?: number;
}

export interface ScenarioProviderOptions {
    /** Provider id, as seen by core (key resolution, model picker, events). Default `scenario`. */
    id?: string;
    /** Display name. Default `Scripted model`. */
    name?: string;
    /**
     * Calls answered in order; the last one repeats. The simplest form — a demo that
     * always goes the same way, a test that needs three replies. Every call to the
     * model advances, a tool round-trip included.
     */
    turns?: ScenarioTurn[];
    /**
     * Named scenarios, one of which answers each call — picked by `match`, or by the
     * default: the `after` of a tool result, else the first `when` that matches the
     * last user message, else `default`, else the first one. A bare turn value is
     * `{ turn }`.
     */
    scenarios?: Record<string, Scenario | ScenarioTurn>;
    /** Picks the scenario for a call, by name. Return `undefined` to fall back to the default rule. */
    match?: (request: AparteChatRequest, scenarios: Record<string, Scenario>) => string | undefined;
    /** Typing pace, or `'instant'` for a test that wants the whole reply at once. */
    pacing?: ScenarioPacing | 'instant';
    /** The models the picker offers. Default: one, `scripted`, declaring streaming and tools. */
    models?: AparteAIModel[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const textOf = (message: AparteChatMessage | undefined): string => {
    if (!message) return '';
    const { content } = message;
    if (typeof content === 'string') return content;
    return content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');
};

const stepsOf = (turn: ScenarioTurn): ScenarioStep[] => (typeof turn === 'string' ? [{ text: turn }] : turn);

const isTurn = (value: Scenario | ScenarioTurn): value is ScenarioTurn => typeof value === 'string' || Array.isArray(value);

const normalize = (scenarios: Record<string, Scenario | ScenarioTurn>): Record<string, Scenario> => {
    const out: Record<string, Scenario> = {};
    for (const [key, value] of Object.entries(scenarios)) out[key] = isTurn(value) ? { turn: value } : value;
    return out;
};

/** The name of the tool a `tool_result` answers: the call with that id, in the turn before. */
const toolNameOf = (messages: AparteChatMessage[], toolCallId: string | undefined): string | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const call = messages[i]!.toolCalls?.find((tc) => tc.id === toolCallId);
        if (call) return call.name;
    }
    return undefined;
};

/**
 * The default rule: a tool result goes to the scenario that declared `after` for that
 * tool; otherwise the first scenario whose `when` matches the last user message;
 * otherwise `default`; otherwise the first scenario declared.
 */
export function defaultMatch(request: AparteChatRequest, scenarios: Record<string, Scenario>): string | undefined {
    const entries = Object.entries(scenarios);
    const last = request.messages[request.messages.length - 1];
    if (last?.role === 'tool_result') {
        const tool = toolNameOf(request.messages, last.toolCallId);
        const hit = entries.find(([, s]) => s.after !== undefined && s.after === tool);
        if (hit) return hit[0];
    }
    const text = textOf(last);
    for (const [key, s] of entries) {
        if (s.when === undefined) continue;
        if (typeof s.when === 'string' ? text.toLowerCase().includes(s.when.toLowerCase()) : s.when.test(text)) return key;
    }
    if ('default' in scenarios) return 'default';
    return entries[0]?.[0];
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
});

/** Four characters per token — the usual rough cut, enough for a gauge to move. */
const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

let sequence = 0;

/**
 * Play one turn as the event stream the loop reads.
 *
 * Exported for a test or a tool that wants the events without a provider around them.
 */
export function playTurn(
    turn: ScenarioTurn,
    request: AparteChatRequest,
    pacing: ScenarioPacing | 'instant' = {},
    signal?: AbortSignal,
): ReadableStream<AparteStreamEvent> {
    const chunk = pacing === 'instant' ? Number.POSITIVE_INFINITY : Math.max(1, pacing.chunk ?? 12);
    const delay = pacing === 'instant' ? 0 : Math.max(0, pacing.delay ?? 24);
    const steps = stepsOf(turn);
    const inputChars = request.messages.reduce((n, m) => n + textOf(m).length, 0);

    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            let outputChars = 0;
            let usage: Partial<AparteUsage> = {};
            // Not `startedAt`: that name is a segment stamp core writes in one place, and
            // `check:segment-stamp` reads any write to it as a third stamping site.
            const turnBegan = Date.now();
            try {
                for (const step of steps) {
                    if (signal?.aborted) break;
                    if ('wait' in step) {
                        await sleep(step.wait, signal);
                    } else if ('text' in step || 'thinking' in step) {
                        const type = 'text' in step ? 'text' : 'thinking';
                        const body = 'text' in step ? step.text : step.thinking;
                        for (let i = 0; i < body.length; i += chunk) {
                            if (signal?.aborted) break;
                            const delta = body.slice(i, i + chunk);
                            controller.enqueue({ type, delta });
                            outputChars += delta.length;
                            if (delay > 0 && i + chunk < body.length) await sleep(delay, signal);
                        }
                    } else if ('tool' in step) {
                        controller.enqueue({ type: 'tool_use', id: step.id ?? `scenario_${++sequence}`, name: step.tool, input: step.input ?? {} });
                    } else if ('error' in step) {
                        controller.enqueue({ type: 'error', message: step.error });
                        controller.close();
                        return;
                    } else if ('usage' in step) {
                        usage = { ...usage, ...step.usage };
                    }
                }
                if (!signal?.aborted) {
                    const outputTokens = estimateTokens(outputChars);
                    const inputTokens = estimateTokens(inputChars);
                    controller.enqueue({
                        type: 'done',
                        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, durationMs: Date.now() - turnBegan, ...usage },
                    });
                }
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}

// ─── The provider ────────────────────────────────────────────────────────────

/**
 * Build the scripted provider. Register it like any other:
 *
 * ```ts
 * aparteGlobalConfig.registerAIProvider(createScenarioProvider({
 *   scenarios: {
 *     default: 'Ask me for a haiku, a table, or the weather.',
 *     haiku: { when: /haiku/i, turn: 'Web components hum —  \nno framework in the wind,  \njust the page, alive.' },
 *     weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
 *     forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
 *   },
 * }));
 * ```
 */
export function createScenarioProvider(options: ScenarioProviderOptions = {}): AparteAIProvider {
    const id = options.id ?? 'scenario';
    const name = options.name ?? 'Scripted model';
    const models: AparteAIModel[] = options.models ?? [{
        id: 'scripted',
        name,
        description: 'Replays scripted turns — no key, no network.',
        capabilities: ['streaming', 'function_calling'],
    }];
    const scenarios = normalize(options.scenarios ?? {});
    const match = options.match ?? defaultMatch;
    let calls = 0;

    const pick = (request: AparteChatRequest): ScenarioTurn => {
        if (options.turns?.length) {
            const turn = options.turns[Math.min(calls, options.turns.length - 1)]!;
            calls++;
            return turn;
        }
        const key = match(request, scenarios) ?? defaultMatch(request, scenarios);
        const scenario = key !== undefined ? scenarios[key] : undefined;
        if (!scenario) {
            // Said, because the alternative was "Typing…" forever with an empty reply
            // and nothing in the console (issue #29). The usual cause: `match()`
            // returned the scenario OBJECT — the second argument hands you the objects,
            // so it is an easy slip — where the loop needs its KEY.
            const got = key === undefined ? 'nothing' : typeof key === 'string' ? `"${key}"` : `a ${typeof key}`;
            console.warn(
                `[provider-scenario] no scenario for this call: match() returned ${got}, and the keys are `
                + `${Object.keys(scenarios).map((k) => `"${k}"`).join(', ') || '(none)'}. Return a key, or `
                + '`undefined` to fall back to the default rule. Streaming an empty turn.',
            );
        }
        return scenario?.turn ?? '';
    };

    return {
        id,
        getMetadata: () => ({
            id,
            name,
            description: 'Replays scripted turns — no key, no network.',
            isLocal: true,
            configSchema: { fields: [] },
        }),
        getModels: () => models,
        fetchModels: async () => models,
        async chat(request: AparteChatRequest, _config?: unknown, ctx?: { providerId: string; signal?: AbortSignal }): Promise<AparteChatResponse> {
            return playTurn(pick(request), request, options.pacing, ctx?.signal);
        },
    };
}

export { showcase } from './presets.js';
