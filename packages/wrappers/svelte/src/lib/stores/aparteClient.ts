import { onMount } from 'svelte';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on destroy. Call from a component's script.
 * Svelte equivalent of Angular's `AparteAiService`.
 *
 * The stop is the cleanup `onMount` returns, not an `onDestroy`: Svelte runs `onDestroy` on
 * the server too, at the end of a render, and stopping a client that never started there read
 * `window` and failed the page.
 */
export function createAparteClient(options?: AparteClientOptions) {
    const client = new AparteClient(options ?? {});
    onMount(() => {
        client.start();
        return () => client.stop();
    });
    return { client, abort: () => client.abort() };
}
