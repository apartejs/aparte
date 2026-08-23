import '@aparte/core/styles.css';
import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import '@aparte/plugin-model-selector'; // registers <aparte-model-selector>
import { applySystemPrompt, loadSettings, settingsKeyResolver } from './settings-store';

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

    // Both LOCAL and keyless: zero setup, zero account. A cloud provider used to
    // be registered here; its only visible trace was a key field for a service the
    // reader may not have, and the settings view already covers pointing at any
    // endpoint with any token — the same code path a cloud provider uses.
    aparteGlobalConfig.registerAIProvider(
        createOpenAICompatProvider(presets.OLLAMA),
        createOpenAICompatProvider(presets.LMSTUDIO),
    );
    // Gate the composer (block send + grey out) until the model selector has
    // fetched its list and auto-selected a model.
    aparteGlobalConfig.setRequireModelSelection(true);

    aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

    // Opt into what this app can honor: retry/edit go through the client below,
    // and the image tile opens the lightbox wired at the end of this function.
    // The ⓘ details popover isn't implemented here, so it stays hidden.
    aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
    aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });

    // The endpoint + token from the settings view, for ANY provider. The record
    // form (`{ apiKey, endpoint }`) is the only runtime channel for an endpoint.
    new AparteClient({ keyResolver: settingsKeyResolver(loadSettings) }).start();

    // The stored system prompt has to be on the config before the first turn.
    applySystemPrompt(aparteGlobalConfig, loadSettings());

    wireAttachmentLightbox();
}

/**
 * The image-tile preview: core only ASKS (`aparte-attachment-preview`), the modal
 * is the app's. So we declare it AND actually open something — a declaration with
 * no listener behind it is the dead button we just removed from core.
 */
function wireAttachmentLightbox(): void {
    const dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.innerHTML = '<img alt="" />';
    dialog.addEventListener('click', () => dialog.close());
    document.body.appendChild(dialog);

    document.addEventListener('aparte-attachment-preview', (e) => {
        const { url, name } = (e as CustomEvent<{ url: string; name: string }>).detail;
        const img = dialog.querySelector('img')!;
        img.src = url;
        img.alt = name;
        dialog.showModal();
    });
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
