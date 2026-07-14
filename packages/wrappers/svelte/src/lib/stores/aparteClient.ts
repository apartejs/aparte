import { onMount, onDestroy } from 'svelte';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on destroy. Call from a component's script.
 * Svelte equivalent of Angular's `AparteAiService`.
 */
export function createAparteClient(options?: AparteClientOptions) {
    const client = new AparteClient(options ?? {});
    onMount(() => { client.start(); });
    onDestroy(() => client.stop());
    return { client, abort: () => client.abort() };
}
