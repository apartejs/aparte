import { onMounted, onBeforeUnmount } from 'vue';
import { AparteClient, type AparteClientOptions } from '@aparte/core';

/**
 * Mounts an `AparteClient` that bridges `aparte-send` events to the configured AI
 * providers. Starts on mount, stops on unmount. Vue equivalent of Angular's
 * `AparteAiService`.
 */
export function useAparteClient(options?: AparteClientOptions) {
    const client = new AparteClient(options ?? {});
    onMounted(() => client.start());
    onBeforeUnmount(() => client.stop());
    return { client, abort: () => client.abort() };
}
