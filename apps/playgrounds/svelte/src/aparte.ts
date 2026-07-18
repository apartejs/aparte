import '@aparte/core/styles.css';
import { AparteConfig, AparteClient, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import '@aparte/plugin-model-selector'; // registers <aparte-model-selector>

export const KEY_STORAGE = 'aparte.openrouter.key';

let started = false;

/**
 * One-time aparté setup: Markdown rendering, real providers (two local + OpenRouter
 * BYOK), a browser-direct transport, and the AparteClient that drives every
 * <AparteChat> on the page. Idempotent.
 */
export function setupAparte(): void {
    if (started) return;
    started = true;

    setupMarkedProvider();

    AparteConfig.registerAIProvider(
        createOpenAICompatProvider(presets.OLLAMA),
        createOpenAICompatProvider(presets.LMSTUDIO),
        createOpenAICompatProvider(presets.OPENROUTER),
    );
    // Gate the composer (block send + grey out) until the model selector has
    // fetched its list and auto-selected a model.
    AparteConfig.setRequireModelSelection(true);

    AparteConfig.setTransport(new DirectTransport({ byok: true }));

    new AparteClient({
        keyResolver: (providerId) =>
            providerId === 'openrouter' ? (localStorage.getItem(KEY_STORAGE) ?? undefined) : undefined,
    }).start();
}

/** Dispatch a send from the composer so the client (and the optimistic user bubble) both fire. */
export function sendPrompt(text: string): void {
    document.querySelector('aparte-composer')?.dispatchEvent(
        new CustomEvent('aparte-send', {
            detail: { content: text, timestamp: Date.now() },
            bubbles: true,
            composed: true,
        }),
    );
}
