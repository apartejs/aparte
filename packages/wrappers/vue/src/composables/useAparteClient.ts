import { onMounted, onBeforeUnmount } from 'vue';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on unmount. Vue equivalent of Angular's
 * `AparteAiService`.
 */
export function useAparteClient(options?: AparteClientOptions) {
    // `echoUserMessage: false`: the wrapper's ConversationController owns the
    // transcript and appends the user message itself — the client's default echo
    // would double it. Overridable, like any option.
    const client = new AparteClient({ echoUserMessage: false, ...(options ?? {}) });
    onMounted(() => client.start());
    onBeforeUnmount(() => client.stop());
    return { client, abort: () => client.abort() };
}
