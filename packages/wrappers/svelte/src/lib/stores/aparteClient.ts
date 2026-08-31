import { onMount, onDestroy } from 'svelte';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on destroy. Call from a component's script.
 * Svelte equivalent of Angular's `AparteAiService`.
 */
export function createAparteClient(options?: AparteClientOptions) {
    // `echoUserMessage: false`: the wrapper's ConversationController owns the
    // transcript and appends the user message itself — the client's default echo
    // would double it. Overridable, like any option.
    const client = new AparteClient({ echoUserMessage: false, ...(options ?? {}) });
    onMount(() => { client.start(); });
    onDestroy(() => client.stop());
    return { client, abort: () => client.abort() };
}
