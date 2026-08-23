import '@aparte/core'; // registers the <aparte-*> custom elements
// Core's theme, through the package export so the dev server's source condition
// applies (a CSS `@import` would not get it, and would serve the stale dist).
// The APP SHELL's stylesheet is a <link> in index.html instead — see the comment
// there: a JS-injected stylesheet arrives after this module does, and this
// document ships its shell as static HTML, so that gap was visible.
import '@aparte/core/styles.css';

import {
    registerDefaultRenderers,
    aparteGlobalConfig,
    AparteClient,
    AparteDirectTransport,
    filesToAttachments,
} from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
// Registers the `ask_user` tool AND the <aparte-elicitation> panel that answers
// it. This example had no tool at all, which made the whole tools path — approval,
// elicitation, the guide — undemonstrated on the one app that is raw core: asking a
// local model to "use the question tool" got a truthful "I have no such tool".
import { setupAskUser } from '@aparte/plugin-ask-user';
import { runStreamAgent } from '@aparte/engine';
import {
    DEFAULT_SETTINGS,
    applySystemPrompt,
    isSettingsView,
    loadSettings,
    saveSettings,
    settingsKeyResolver,
    type ExampleSettings,
} from './settings-store';

// 1. Renderers + Markdown rendering for assistant replies.
registerDefaultRenderers();
setupMarkedProvider();
setupAskUser();

// 2. Real providers — both LOCAL and keyless, so this example runs with zero
//    setup and zero account. A cloud provider used to be registered here too; it
//    was removed because its only visible trace was a key field for a service the
//    reader does not have, and the settings view already covers any endpoint +
//    token you want to point at (that is the same code path a cloud provider uses).
aparteGlobalConfig.registerAIProvider(
    createOpenAICompatProvider(presets.OLLAMA),
    createOpenAICompatProvider(presets.LMSTUDIO),
);

// 3. Browser talks to the provider directly; the key (if any) stays in the browser.
// Gate the composer until the model selector has fetched + auto-selected a model.
aparteGlobalConfig.setRequireModelSelection(true);

aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

// 4. Opt into the affordances THIS app can honor. Retry and edit need the client
//    below to re-send and rewrite; the image tile needs the lightbox we wire at
//    the bottom of this file. What we don't handle (the ⓘ details popover, running
//    a terminal command) stays out of the UI rather than showing a dead button.
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });

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
    // The endpoint + token the settings view holds, for ANY provider. The record
    // form (`{ apiKey, endpoint }`) is the only runtime channel for an endpoint,
    // and it is honoured on both the chat and the /models path.
    keyResolver: settingsKeyResolver(loadSettings),
});

// The stored system prompt has to be on the config before the first turn.
applySystemPrompt(aparteGlobalConfig, loadSettings());
client.start(); // listens for aparte-send/retry/edit and streams replies into the chat

// Register <aparte-model-selector> AFTER providers are registered, so its async
// connectedCallback loads the model list with the providers already present
// (a static import would upgrade the element mid-setup and miss them).
void import('@aparte/plugin-model-selector');

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

    // Welcome suggestion chips → the composer, not a synthetic event.
    //
    // Dispatching `aparte-send` directly looked equivalent and was not: the
    // composer's `submit()` is where every gate lives — disabled, already
    // streaming, and the `requireModelSelection` gate that stays on until
    // `GET /models` comes back. So these chips were live while the composer was
    // visibly greyed out, and a click sent a request with an empty model id.
    const composer = document.querySelector('aparte-composer') as
        (HTMLElement & { setValue(v: string): void; submit(): void }) | null;
    document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            composer?.setValue(chip.dataset.prompt ?? chip.textContent ?? '');
            composer?.submit();
        });
    });

    // Hide the suggestions once the conversation starts.
    chat.addEventListener('aparte-send', () => document.getElementById('welcome')?.remove(), { once: true });
}

// ── Two chats on one page (`?chats=2`) ───────────────────────────────────────
// Off by default, so the example stays the single-chat reference. It shows the
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

// ── The settings view ────────────────────────────────────────────────────────
//
// Reachable at `?view=settings`, so it is a link a reader can share rather than a
// hidden mode. Applied on change: the system prompt goes onto the config, and the
// endpoint and token are read live by the resolver above on the next request — so
// there is nothing to commit and a Save button would imply otherwise.
//
// Two of these three fields exist BECAUSE they have no setter. `setSystemPrompt`
// is an API; an endpoint and a token are not — they travel through the key
// resolver as `{ apiKey, endpoint }`, which core's own JSDoc calls "the legacy
// `string | Record` auth shape" and which no example demonstrated.
function wireSettingsView(): void {
    const view = document.querySelector<HTMLElement>('#settings-view');
    const chat = document.querySelector<HTMLElement>('.app:not(.settings)');
    if (!view || !chat) return;

    if (!isSettingsView()) return;
    chat.hidden = true;
    view.hidden = false;

    const promptEl = view.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const endpointEl = view.querySelector<HTMLInputElement>('#endpoint')!;
    const tokenEl = view.querySelector<HTMLInputElement>('#token')!;

    const render = (settings: ExampleSettings): void => {
        promptEl.value = settings.systemPrompt;
        endpointEl.value = settings.endpoint;
        tokenEl.value = settings.token;
    };
    render(loadSettings());

    const commit = (): void => {
        const next: ExampleSettings = {
            systemPrompt: promptEl.value,
            endpoint: endpointEl.value,
            token: tokenEl.value,
        };
        saveSettings(next);
        applySystemPrompt(aparteGlobalConfig, next);
    };
    // `input`, not `change`: a reader who types and navigates away without blurring
    // the field would otherwise lose what they typed.
    for (const el of [promptEl, endpointEl, tokenEl]) el.addEventListener('input', commit);

    view.querySelector<HTMLButtonElement>('#settings-reset')?.addEventListener('click', () => {
        render({ ...DEFAULT_SETTINGS });
        commit();
    });
}

wireSettingsView();
