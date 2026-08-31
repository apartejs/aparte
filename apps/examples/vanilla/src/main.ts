import '@aparte/core'; // registers the <aparte-*> custom elements
// Core's theme, through the package export so the dev server's source condition
// applies (a CSS `@import` would not get it, and would serve the stale dist).
// The APP SHELL's stylesheet is a <link> in index.html instead — see the comment
// there: a JS-injected stylesheet arrives after this module does, and this
// document ships its shell as static HTML, so that gap was visible.
import '@aparte/core/styles.css';

import {
    registerDefaultRenderers,
    registerSegmentRenderer,
    getSegmentRenderer,
    isSegmentSettled,
    segmentDuration,
    aparteGlobalConfig,
    AparteClient,
    AparteDirectTransport,
} from '@aparte/core';
import type { AparteThinkingSegment } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
// Registers the `ask_user` tool AND the <aparte-elicitation> panel that answers
// it. This example had no tool at all, which made the whole tools path — approval,
// elicitation, the guide — undemonstrated on the one app that is raw core: asking a
// local model to "use the question tool" got a truthful "I have no such tool".
import { setupAskUser } from '@aparte/plugin-ask-user';
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { runStreamAgent } from '@aparte/engine';
import { setupCompaction } from '@aparte/plugin-compaction';
import { createScenarioProvider, showcase } from '@aparte/provider-scenario';
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
// The artifact is a plugin: the `create_artifact` tool, the `<artifact>` grammar and
// the Code/Preview card that renders both, in one call.
setupArtifacts();

// 1b. "Thought for 1.4s" — the market's collapsed reasoning line, built HERE.
//
// Core measures the span (it owns the stream, so it writes `meta.aparte`
// on every segment) and deliberately renders nothing: the line reads "Thought for
// 8s" in one product and "8.2s · 1.2k tokens" in another, and a library that
// picks one is wrong in the other. So this is ~15 lines of app code, and it is
// here rather than only in the guide because a capability with no running
// consumer is a capability nobody can see working.
//
// Two things this wrapping has to get right, both learned the hard way:
//  - keep the ROOT the built-in produced. The bubble finds a segment to update
//    with `:scope > [data-segment-id="…"]`, so wrapping it in a div of your own
//    hides that attribute and every token falls back to a full transcript
//    re-render instead of the in-place write.
//  - delegate `setup` and `update`. They carry the scroll anchoring, the
//    incremental markdown writer and the highlight-on-settle; reimplementing them
//    is how you lose 80 lines of behaviour without noticing.
const builtInThinking = getSegmentRenderer('thinking')!;
registerSegmentRenderer<AparteThinkingSegment>({
    type: 'thinking',
    render(segment) {
        const out = builtInThinking.render(segment);
        const host = typeof out === 'string' ? parseRoot(out) : out;
        writeDuration(host, segment);
        return host;
    },
    setup: (el, segment) => builtInThinking.setup?.(el, segment),
    update(el, segment) {
        builtInThinking.update?.(el, segment);
        // ALSO here, and this is the whole trick: a block is created open and
        // settles later, and a settle reaches a renderer through `update` — never
        // through a second `render`. Writing the label in `render` alone leaves it
        // reading "Thinking" forever, which is exactly what the first browser run
        // showed.
        writeDuration(el, segment);
    },
});

/** "Thinking" → "Thought for 1.4s", once the span is closed. */
function writeDuration(host: HTMLElement, segment: AparteThinkingSegment): void {
    // `isSegmentSettled` and `segmentDuration` are core's own rules, imported rather
    // than re-derived. The hand-written version of this was
    //     if (!isSegmentSettled(s) || !s.meta?.aparte?.startedAt) return;
    // which is three conditions to get right and wrong at epoch 0.
    if (!isSegmentSettled(segment)) return;
    const ms = segmentDuration(segment);
    if (ms === undefined) return;
    const label = host.querySelector('.aparte-thinking-label');
    // A sub-second span is "<1s", not "0.0s": a duration that reads as zero says the
    // model did not think, which is the opposite of what the block means.
    if (label) label.textContent = ms < 1000 ? 'Thought for <1s' : `Thought for ${(ms / 1000).toFixed(1)}s`;
}

/** A markup string back to the single root element it describes. */
function parseRoot(html: string): HTMLElement {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild as HTMLElement;
}

// 2. Real providers — both LOCAL and keyless, so this example runs with zero
//    setup and zero account. A cloud provider used to be registered here too; it
//    was removed because its only visible trace was a key field for a service the
//    reader does not have, and the settings view already covers any endpoint +
//    token you want to point at (that is the same code path a cloud provider uses).
//
//    `?scenario` swaps them for the scripted model: the same page with no local
//    server, no key and the same replies every time — what a demo, a screenshot
//    or a test of THIS app wants. The scripted model declares a context window so
//    the gauge in the toolbar has something to measure against.
const scenarioMode = new URLSearchParams(location.search).has('scenario');
if (scenarioMode) {
    aparteGlobalConfig.registerAIProvider(createScenarioProvider({
        scenarios: showcase,
        models: [{ id: 'scripted', name: 'Scripted model', contextWindow: 8000, capabilities: ['streaming', 'function_calling'] }],
    }));
    // The showcase's weather turn calls this tool. An app that never registered it
    // would see the call fail — also a scenario, but the round-trip is the point here.
    aparteGlobalConfig.registerTool(
        {
            name: 'get_weather',
            description: 'Current weather for a city.',
            inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        async (call) => ({ toolCallId: call.id, content: `Cloudy, 14 °C in ${String(call.input['city'] ?? 'Lille')}.` }),
    );
} else {
    aparteGlobalConfig.registerAIProvider(
        createOpenAICompatProvider(presets.OLLAMA),
        createOpenAICompatProvider(presets.LMSTUDIO),
    );
}

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

// Compaction: the gauge's `auto-compact` (index.html) asks on reaching 90 %, and this
// answers — the newest turns that still fit the model's window stay verbatim, the rest
// is summarised through the same provider, key and endpoint the chat uses.
setupCompaction({ keyResolver: settingsKeyResolver(loadSettings) });

// Register <aparte-model-selector> AFTER providers are registered, so its async
// connectedCallback loads the model list with the providers already present
// (a static import would upgrade the element mid-setup and miss them).
void import('@aparte/plugin-model-selector');

// ── Layout variants (`?layout=split`, `?layout=shell`) ───────────────────────
//
// Same convention as `?chats=2` below: off by default, so the page stays the
// single-chat reference, and reachable by a URL a reader can share.
//
//   ?layout=split — the chat in one pane of an <aparte-split>, an <iframe> in the
//                   other. The FRAME is the point: a pointer that crosses an iframe
//                   is delivered to the frame's document and lost, which is what the
//                   split's drag scrim exists to prevent. Nothing else in this repo
//                   put a frame beside a chat, so nothing proved it.
//   ?layout=shell — the same split, inside the real application shell: a sidebar
//                   that becomes a drawer, a header with its toggle and the two
//                   [data-aparte-split-pane] buttons. The shell had zero browser
//                   coverage before this — no example app contained one.
//
// The restructure runs HERE, before any of the chat wiring below: it moves the
// existing <aparte-chat> rather than building a second one, so the client, the
// optimistic bubble and every E2E helper keep driving the same element. It is also
// before the model selector's dynamic import resolves, so that element upgrades
// once, already in its final place.

/** The pane beside the chat. A whole document, because an <iframe> is the case under test. */
const PREVIEW_DOC =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<style>body{margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;background:#f7f3ec;color:#221d17}'
    + 'h1{margin:0 0 8px;font-size:1.2rem}p{margin:0;opacity:.8}</style></head>'
    + '<body><h1>Your pane</h1><p>A preview frame, an editor, a canvas. Drag the seam to resize it.</p></body></html>';

/**
 * Wrap `chatEl` in an `<aparte-split>` with a preview frame beside it.
 *
 * Assembled DETACHED and inserted in one go. Building it in place would connect the
 * split with no children, and the element inserts its seam between the first two —
 * with none there it lands first, which is the pane track the stacked rules hide.
 */
function buildSplit(chatEl: HTMLElement): HTMLElement {
    const split = document.createElement('aparte-split');
    split.setAttribute('position', '38');
    split.setAttribute('style', 'height:100%; --aparte-split-min: 16rem');

    const pane = document.createElement('section');
    pane.className = 'aparte-split__pane';
    const frame = document.createElement('iframe');
    frame.title = 'Preview';
    frame.setAttribute('style', 'display:block; inline-size:100%; block-size:100%; border:0');
    // `srcdoc` through setAttribute, never interpolated into innerHTML.
    frame.setAttribute('srcdoc', PREVIEW_DOC);
    pane.appendChild(frame);

    const parent = chatEl.parentElement;
    const anchor = chatEl.nextSibling;
    chatEl.remove();
    split.appendChild(chatEl);
    split.appendChild(pane);
    parent?.insertBefore(split, anchor);
    return split;
}

/** The two buttons that switch panes while the split is stacked. No script behind them. */
function paneSwitcher(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'aparte-app-header__actions';
    // `--surface` rather than a bare `.aparte-btn`: the plain form is a ghost, which
    // reads as two words of text rather than two controls when nothing sits beside it.
    actions.innerHTML =
        '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="start">Chat</button>'
        + '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="end">Preview</button>';
    return actions;
}

/** `?layout=shell` — sidebar, header, and the split in the main area. */
function buildShell(app: HTMLElement, split: HTMLElement): void {
    const shell = document.createElement('div');
    shell.className = 'aparte-app-shell';
    shell.innerHTML = `
      <aparte-sidebar>
        <div class="aparte-sidebar__header">
          <span class="aparte-sidebar__brand">aparté</span>
        </div>
        <div class="aparte-sidebar__search aparte-field-group">
          <input class="aparte-field aparte-field--sm" type="search" placeholder="Search conversations"
                 aria-label="Search conversations" data-aparte-sidebar-search />
        </div>
        <div class="aparte-sidebar__body">
          <aparte-conversation-list></aparte-conversation-list>
        </div>
      </aparte-sidebar>
      <header class="aparte-app-header">
        <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button"
                aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>&#9776;</button>
        <span class="aparte-app-header__title">aparté · vanilla</span>
      </header>
      <main class="aparte-app-shell__main"></main>`;
    shell.querySelector('.aparte-app-header')?.appendChild(paneSwitcher());
    split.remove();
    shell.querySelector('.aparte-app-shell__main')?.appendChild(split);
    // The topbar's job — the brand, and the way out to the settings view — is the
    // header's now, so the page does not carry two of them.
    const viewswitch = app.querySelector('.viewswitch');
    if (viewswitch) shell.querySelector('.aparte-app-header__actions')?.appendChild(viewswitch);
    app.querySelector('.topbar')?.remove();
    app.appendChild(shell);
}

const layoutParam = new URLSearchParams(location.search).get('layout');
//   ?layout=page — the overlay-composer anatomy: the transcript's scroll surface
//                  spans the whole column and the composer floats over it, so the
//                  scrollbar runs edge to edge. One attribute is the whole variant —
//                  which is the point. The element is moved in place because core is
//                  imported statically above: the viewport wired its observers when
//                  the parser upgraded it, BEFORE this block ran, and the mode is
//                  read at that moment — a disconnect/reconnect re-runs the wiring.
if (layoutParam === 'page') {
    const chatEl = document.querySelector<HTMLElement>('aparte-chat');
    if (chatEl) {
        chatEl.setAttribute('overlay-composer', '');
        const parent = chatEl.parentElement;
        const anchor = chatEl.nextSibling;
        chatEl.remove();
        parent?.insertBefore(chatEl, anchor);
    }
}
if (layoutParam === 'split' || layoutParam === 'shell') {
    const app = document.querySelector<HTMLElement>('.app:not(.settings)');
    const chatEl = document.querySelector<HTMLElement>('aparte-chat');
    if (app && chatEl) {
        const split = buildSplit(chatEl);
        if (layoutParam === 'shell') buildShell(app, split);
        else app.querySelector('.topbar')?.insertBefore(paneSwitcher(), app.querySelector('.viewswitch'));
    }
}

// ── Chat wiring ──────────────────────────────────────────────────────────────
// No user-bubble handler: AparteClient echoes the user's message itself (its
// default) and streams the assistant reply. This file used to carry the handler
// every raw-core host wrote — and whoever forgot shipped a chat where the person
// cannot see what they typed, which is exactly why the client took the job.
const chat = document.querySelector('aparte-chat');

if (chat) {
    // The welcome heading goes once the conversation starts. The starters under it
    // are an <aparte-suggestions empty-only> and hide themselves; they used to be four
    // hand-wired chips here, which is what the element replaced.
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

    const second = document.createElement('aparte-chat');
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
    // No per-chat user-bubble wiring: the one AparteClient echoes into whichever
    // chat the send targeted, exactly as it streams the reply there.
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
