import '@aparte/core/styles.css';
import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import '@aparte/plugin-model-selector'; // registers <aparte-model-selector>

let started = false;

/**
 * One-time aparté setup: Markdown rendering, two local keyless providers, a
 * browser-direct transport, and the AparteClient that drives every <AparteChat> on
 * the page. Idempotent.
 */
export function setupAparte(): void {
    if (started) return;
    started = true;

    setupMarkedProvider();

    // Both LOCAL and keyless: this example runs with zero setup and zero account.
    // A cloud provider used to be registered here, and its only visible trace was a
    // key field in the topbar for a service the reader may not have.
    aparteGlobalConfig.registerAIProvider(
        createOpenAICompatProvider(presets.OLLAMA),
        createOpenAICompatProvider(presets.LMSTUDIO),
    );
    // Gate the composer (block send + grey out) until the model selector has
    // fetched its list and auto-selected a model.
    aparteGlobalConfig.setRequireModelSelection(true);

    aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

    // Retry and edit need someone to re-send and rewrite - that's the client just
    // below, so this app opts in. The details popover and the image-tile preview
    // are not implemented here, so they stay hidden (see setHostHandlers).
    aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });

    // No keyResolver: both providers are local and keyless. One is needed the
    // moment you point at something that wants a token or a different endpoint —
    // see the vanilla example's settings view for that shape.
    new AparteClient().start();
}

/**
 * Send a suggested prompt the way the user would: put it in the composer and let
 * the composer submit it.
 *
 * This used to dispatch a synthetic `aparte-send` instead, which looked equivalent
 * and was not: `submit()` is where every gate lives — the composer being disabled,
 * a turn already streaming, and the `requireModelSelection` gate that is still on
 * while `GET /models` is in flight. So the suggestion chips were live while the
 * composer was visibly greyed out, and a click sent a request with an empty model
 * id. Going through the composer also puts the text where the user can see it went.
 */
export function sendPrompt(text: string): void {
    const composer = document.querySelector('aparte-composer') as
        (HTMLElement & { setValue(v: string): void; submit(): void }) | null;
    composer?.setValue(text);
    composer?.submit();
}
