import { useEffect, useRef } from 'react';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

export interface UseAparteClient {
    /** The underlying agnostic client. */
    client: AparteClient;
    /** Abort the current AI response + all active tool calls. */
    abort: () => void;
}

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts listening on mount, stops on unmount. React equivalent of
 * Angular's `AparteAiService`.
 *
 * `options` is read ONCE, when the client is constructed on the first render. Later
 * changes are not applied — a `keyResolver` (or any other function option) that closes
 * over state keeps the closure it had on mount, so read the live value inside the
 * function (a ref) rather than expecting a new object to take effect. To swap options
 * wholesale, remount the component that owns the hook (`key`).
 *
 * @example
 * const { abort } = useAparteClient({ keyResolver });
 */
export function useAparteClient(options?: AparteClientOptions): UseAparteClient {
    const ref = useRef<AparteClient | null>(null);
    if (!ref.current) ref.current = new AparteClient(options ?? {});
    useEffect(() => {
        const c = ref.current as AparteClient;
        c.start();
        return () => c.stop();
    }, []);
    return { client: ref.current, abort: () => ref.current?.abort() };
}
