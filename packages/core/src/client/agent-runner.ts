import type { StreamRunEvent, StreamUsage } from '@aparte/engine';
import type { AparteChatRequest } from '../types/chat.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';
import { readNdjson } from '../utils/ndjson.js';
import { jsonHeaders } from '../transport/json-headers.js';
import type { AparteStreamRunner } from './stream-adapter.js';

export interface AgentStreamRunnerOptions {
    /** The route that serves `createAparteAgentHandler`, e.g. `/api/agent`. */
    endpoint: string;
    /** Sent with every request; a function is called per request (a fresh token each time). */
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
    /** @default the global `fetch` */
    fetch?: typeof fetch;
    /** For a cross-origin endpoint that authenticates by cookie. */
    credentials?: RequestCredentials;
}

type WireLine = StreamRunEvent | { type: 'run-error'; message: string; code?: string };

/** The lines that start, end or pause the run: never a sub-agent's. */
const RUN_LEVEL = new Set(['run-start', 'run-done', 'run-aborted', 'run-suspended']);

/**
 * An `AparteStreamRunner` that runs `AparteClient`'s loop on YOUR server — the one
 * `createAparteAgentHandler` serves — and replays its events here, where the client's
 * adapter draws them exactly as it draws a loop run in the page.
 *
 * ```ts
 * const client = new AparteClient({ streamRunner: createAgentStreamRunner({ endpoint: '/api/agent' }) });
 * ```
 *
 * The page needs no provider of its own: the server runs the model. A provider and model
 * the page selects anyway travel with the turn, and the server uses them.
 *
 * A pipe, nothing more. It sees no message and no segment, so it opens no panel and runs
 * no tool: when the server suspends a run, the CLIENT asks the person or runs the browser
 * tool, then calls this runner again with the answers in `deferral` — the same path it
 * takes when a conversation with a paused call is reloaded days later.
 */
export function createAgentStreamRunner(options: AgentStreamRunnerOptions): AparteStreamRunner {
    // Said once per runner: a backend that sends one such line sends it every turn.
    let warnedAttributedEnd = false;
    return async (opts) => {
        const doFetch = options.fetch ?? fetch;
        const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
        // The browser's registered tools travel as definitions: the server marks them
        // external and hands their calls back here.
        const { tools, ...request } = opts.baseRequest as AparteChatRequest;
        // No provider id when the page registered none: the handler runs its own.
        const body = {
            v: 1,
            ...(opts.providerId ? { providerId: opts.providerId } : {}),
            messageId: opts.messageId,
            request,
            clientTools: tools ?? [],
            ...(opts.deferral?.token
                ? { resume: { ticket: opts.deferral.token, outcomes: opts.deferral.outcomes ?? {} } }
                : {}),
        };
        const response = await doFetch(options.endpoint, {
            method: 'POST',
            headers: jsonHeaders(headers),
            body: JSON.stringify(body),
            signal: opts.signal,
            ...(options.credentials ? { credentials: options.credentials } : {}),
        });
        if (!response.ok || !response.body) {
            const message = await response.json()
                .then((json: { error?: { message?: string } }) => json?.error?.message)
                .catch(() => undefined);
            throw new AparteError(
                message || `The agent endpoint answered HTTP ${response.status}.`,
                AparteError.codeForStatus(response.status) ?? AparteErrorCode.PROVIDER_ERROR,
                undefined, undefined, response.status,
            );
        }

        let usage: StreamUsage | undefined;
        let ended = false;
        for await (const line of readNdjson<WireLine>(response.body, opts.signal)) {
            if (line.type === 'run-error') {
                // A code of ours is the error's own code, because the client acts on it: an
                // overflow is compacted and sent again, and the gauge turns danger. Anything
                // else (the handler's AGENT_RUN_FAILED) stays a provider error, the raw value
                // kept in `data`.
                const known = (Object.values(AparteErrorCode) as string[]).includes(line.code ?? '')
                    ? line.code as AparteErrorCode
                    : undefined;
                throw new AparteError(line.message || 'The agent run failed.', known ?? AparteErrorCode.PROVIDER_ERROR, line.code ? { code: line.code } : undefined);
            }
            if (RUN_LEVEL.has(line.type) && (line as { agentId?: unknown }).agentId != null) {
                // A sub-agent never starts, ends or pauses the run. A hand-written backend that
                // writes a sub-agent's own `run-done` would otherwise end the turn early.
                if (!warnedAttributedEnd) {
                    warnedAttributedEnd = true;
                    console.warn(
                        `[aparte] The agent endpoint sent a "${line.type}" line carrying an agentId; it was dropped. `
                        + 'A sub-agent never starts or ends the run: close it with "agent-end", and end the run with one "run-done" of its own.',
                    );
                }
                continue;
            }
            if (line.type === 'run-done' || line.type === 'run-suspended') {
                usage = line.usage;
                ended = true;
            }
            opts.emitter(line);
        }
        // A server that dies mid-run closes the stream without its last line. Saying so
        // is what keeps the reply from spinning "streaming" for good.
        if (!ended && !opts.signal.aborted) {
            throw new AparteError('The agent stream ended unexpectedly.', AparteErrorCode.PROVIDER_ERROR);
        }
        return usage;
    };
}
