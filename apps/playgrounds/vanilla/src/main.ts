import '@aparte/core'; // registers the <aparte-*> custom elements
import '@aparte/core/styles.css'; // theme variables + component styles
import './style.css';

import { registerDefaultRenderers, AparteConfig, AparteClient, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';

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

const client = new AparteClient({
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
type ChatViewport = { appendMessage(m: { id: string; role: string; content: string; timestamp: number }): void };
const chat = document.querySelector('aparte-chat') as (HTMLElement & { viewport?: ChatViewport | null }) | null;

/** Append the optimistic USER bubble for one chat element. */
function wireOptimisticUserBubble(el: HTMLElement & { viewport?: ChatViewport | null }): void {
    el.addEventListener('aparte-send', (e) => {
        const detail = (e as CustomEvent<{ content: string }>).detail;
        el.viewport?.appendMessage({
            id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'user',
            content: detail.content,
            timestamp: Date.now(),
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
