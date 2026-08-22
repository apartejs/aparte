import '@aparte/core/styles.css';
import { AparteConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
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

    AparteConfig.setTransport(new AparteDirectTransport({ byok: true }));

    // Opt into what this app can honor: retry/edit go through the client below,
    // and the image tile opens the lightbox wired at the end of this function.
    // The ⓘ details popover isn't implemented here, so it stays hidden.
    AparteConfig.setBubbleActions({ retry: true, edit: true });
    AparteConfig.setHostHandlers({ attachmentPreview: true });

    new AparteClient({
        keyResolver: (providerId) =>
            providerId === 'openrouter' ? (localStorage.getItem(KEY_STORAGE) ?? undefined) : undefined,
    }).start();

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
