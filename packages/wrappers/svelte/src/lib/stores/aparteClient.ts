import { onMount, onDestroy } from 'svelte';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on destroy. Call from a component's script.
 * Svelte equivalent of Angular's `AparteAiService`.
 *
 * The stop is an `onDestroy` on purpose: Svelte runs it on the server too, at the end of a
 * render, and that is the only place a server render can take back the `keyResolver` the
 * client put on the config when it was constructed — the global config every request the
 * process serves shares. `stop()` releases it there and touches nothing of the browser.
 */
export function createAparteClient(options?: AparteClientOptions) {
    const client = new AparteClient(options ?? {});
    onMount(() => { client.start(); });
    onDestroy(() => client.stop());
    return { client, abort: () => client.abort() };
}
