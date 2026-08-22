import '@aparte/core'; // registers the <aparte-*> custom elements
import '@aparte/core/styles.css'; // theme variables + component styles
import './style.css';

import {
    registerDefaultRenderers,
    AparteConfig,
    AparteClient,
    DirectTransport,
    filesToAttachments,
} from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { runStreamAgent } from '@aparte/engine';

const KEY_STORAGE = 'aparte.openrouter.key';

// 1. Renderers + Markdown rendering for assistant replies.
registerDefaultRenderers();
setupMarkedProvider();

// 2. Real providers — two local (no key) + OpenRouter (BYOK). The model selector
//    lists all three; pick a running local model to chat with zero setup.
AparteConfig.registerAIProvider(
    createOpenAICompatProvider(presets.OLLAMA),
    createOpenAICompatProvider(presets.LMSTUDIO),
    createOpenAICompatProvider(presets.OPENROUTER),
);

// 3. Browser talks to the provider directly; the key (if any) stays in the browser.
// Gate the composer until the model selector has fetched + auto-selected a model.
AparteConfig.setRequireModelSelection(true);

AparteConfig.setTransport(new DirectTransport({ byok: true }));

// 4. Opt into the affordances THIS app can honor. Retry and edit need the client
//    below to re-send and rewrite; the image tile needs the lightbox we wire at
//    the bottom of this file. What we don't handle (the ⓘ details popover, running
//    a terminal command) stays out of the UI rather than showing a dead button.
AparteConfig.setBubbleActions({ retry: true, edit: true });
AparteConfig.setHostHandlers({ attachmentPreview: true });

// 5. Drive the turn with @aparte/engine's headless loop instead of core's inline
//    one. This is the `streamRunner` seam, and the reason it is wired HERE rather
//    than left to the docs: nothing in the repo used to make this exact
//    composition, so it had no compile coverage and no end-to-end coverage — and
//    it shipped broken (the two packages' message types had drifted apart, which
//    the type guard in stream-events.contract.ts now catches). A capability with no
//    in-repo consumer is a contract maintained for nobody; ratified decision #7
//    says so, and this was the package it should have caught.
//
//    Core works identically without it — remove the option and the inline loop
//    runs. That equivalence is what the engine parity suite asserts.
const client = new AparteClient({
    streamRunner: runStreamAgent,
    keyResolver: (providerId) =>
        providerId === 'openrouter' ? (localStorage.getItem(KEY_STORAGE) ?? undefined) : undefined,
});
client.start(); // listens for aparte-send/retry/edit and streams replies into the chat

// Register <aparte-model-selector> AFTER providers are registered, so its async
// connectedCallback loads the model list with the providers already present
// (a static import would upgrade the element mid-setup and miss them).
void import('@aparte/plugin-model-selector');

// ── BYOK key field (persisted locally, never committed) ──────────────────────
const keyInput = document.querySelector<HTMLInputElement>('#openrouter-key');
if (keyInput) {
    keyInput.value = localStorage.getItem(KEY_STORAGE) ?? '';
    keyInput.addEventListener('change', () => {
        const value = keyInput.value.trim();
        if (value) localStorage.setItem(KEY_STORAGE, value);
        else localStorage.removeItem(KEY_STORAGE);
    });
}

// ── Chat wiring ──────────────────────────────────────────────────────────────
// The bare <aparte-chat> shell doesn't own a ConversationController (that's the
// framework wrappers' job), so we add the optimistic USER bubble ourselves; the
// AparteClient appends and streams the ASSISTANT reply.
type ChatViewport = { appendMessage(m: Record<string, unknown>): void };
const chat = document.querySelector('aparte-chat') as (HTMLElement & { viewport?: ChatViewport | null }) | null;

/**
 * Append the optimistic USER bubble for one chat element. Attached files ride on
 * the event as raw `File`s; `filesToAttachments` turns them into what a bubble
 * renders (this is the conversion the framework wrappers' ConversationController
 * does for you).
 */
function wireOptimisticUserBubble(el: HTMLElement & { viewport?: ChatViewport | null }): void {
    el.addEventListener('aparte-send', (e) => {
        const detail = (e as CustomEvent<{ content: string; files?: File[] }>).detail;
        el.viewport?.appendMessage({
            id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'user',
            content: detail.content,
            timestamp: Date.now(),
            ...(detail.files?.length ? { attachments: filesToAttachments(detail.files) } : {}),
        });
    });
}

if (chat) {
    wireOptimisticUserBubble(chat);

    // Welcome suggestion chips → dispatch a send from the chat element.
    document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            chat.dispatchEvent(
                new CustomEvent('aparte-send', {
                    detail: { content: chip.dataset.prompt ?? chip.textContent ?? '', timestamp: Date.now() },
                    bubbles: true,
                    composed: true,
                }),
            );
        });
    });

    // Hide the suggestions once the conversation starts.
    chat.addEventListener('aparte-send', () => document.getElementById('welcome')?.remove(), { once: true });
}

// ── Two chats on one page (`?chats=2`) ───────────────────────────────────────
// Off by default, so the playground stays the single-chat reference. It shows the
// multi-instance wiring: each chat carries an id, each composer points at it via
// `target`, and ONE AparteClient serves both — it resolves the target per event,
// so a reply can only land in the chat that sent it. The E2E multi-chat suite
// drives this; the model gate is satisfied globally by the first selector, which
// is why the second chat needs no selector of its own.
if (new URLSearchParams(location.search).get('chats') === '2' && chat) {
    chat.id = 'chat-a';
    chat.querySelector('aparte-composer')?.setAttribute('target', 'chat-a');

    const second = document.createElement('aparte-chat') as HTMLElement & { viewport?: ChatViewport | null };
    second.id = 'chat-b';
    second.setAttribute('center-empty', '');
    second.innerHTML = `
      <aparte-chat-viewport></aparte-chat-viewport>
      <aparte-composer target="chat-b">
        <div class="aparte-composer-shell">
          <div class="aparte-composer-row">
            <aparte-composer-input placeholder="Second chat…"></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>`;
    chat.parentElement?.appendChild(second);
    wireOptimisticUserBubble(second);
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

wireAttachmentLightbox();
