import { useEffect, useRef } from 'react';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

export interface UseAparteClient {
    /** The underlying agnostic client. */
    client: AparteClient;
    /** Abort the current AI response + all active tool calls. */
    abort: () => void;
}

/**
 * The options a turn calls back: read from the latest render, not from the first.
 * Not `streamRunner`: the client tells the engine's own loop (`runStreamAgent`) from a runner
 * that calls the model elsewhere by identity, and a forwarder in its place reads as the latter.
 */
const FUNCTION_OPTIONS = [
    'keyResolver', 'approvalResolver', 'requestInterceptor',
    'history', 'targetResolver', 'fileInjectFilter',
] as const;
type FunctionOption = (typeof FUNCTION_OPTIONS)[number];
type AnyFunction = (...args: unknown[]) => unknown;

/**
 * The options the client is built with, each function among them replaced by one that calls
 * the latest render's. Which options are present is decided here, once: a function the first
 * render passed and a later one dropped keeps calling the first.
 */
function throughLatest(first: AparteClientOptions, latest: { current: AparteClientOptions | undefined }): AparteClientOptions {
    const options: AparteClientOptions = { ...first };
    for (const name of FUNCTION_OPTIONS) {
        const initial = first[name];
        if (typeof initial !== 'function') continue;
        const call = (...args: unknown[]): unknown => {
            const current = latest.current?.[name];
            return ((typeof current === 'function' ? current : initial) as AnyFunction)(...args);
        };
        (options as Record<FunctionOption, unknown>)[name] = call;
    }
    return options;
}

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts listening on mount, stops on unmount. React equivalent of
 * Angular's `AparteAiService`.
 *
 * The client is built once, on the first render. Its function options — `keyResolver`,
 * `approvalResolver`, `requestInterceptor`, `history` (as a function), `targetResolver` and
 * `fileInjectFilter` — are called from the LATEST render, so one that closes over state sees
 * the state of now, not of the mount. `streamRunner` is read once and handed to the client as
 * it is (the client recognises the engine's own loop by identity); a runner that reads state
 * reads it through a ref. The other options (`config`, `scopeToTargetId`, `maxTurns`…) are
 * read once, and so is whether a function option is there at all; to change those, remount
 * the component that owns the hook (`key`).
 *
 * @example
 * const { abort } = useAparteClient({ keyResolver });
 */
export function useAparteClient(options?: AparteClientOptions): UseAparteClient {
    const latest = useRef(options);
    latest.current = options;
    const ref = useRef<AparteClient | null>(null);
    if (!ref.current) ref.current = new AparteClient(throughLatest(options ?? {}, latest));
    useEffect(() => {
        const c = ref.current as AparteClient;
        c.start();
        return () => c.stop();
    }, []);
    return { client: ref.current, abort: () => ref.current?.abort() };
}
