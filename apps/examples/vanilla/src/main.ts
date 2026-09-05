import '@aparte/core'; // registers the <aparte-*> custom elements
// No stylesheet import here: core's CSS comes through the <link> in index.html (see
// src/style.css), which is render-blocking — a JS-injected sheet arrives after this
// module, and the static shell painted bare until then.

import {
    registerDefaultRenderers,
    registerSegmentRenderer,
    getSegmentRenderer,
    isSegmentSettled,
    segmentDuration,
    aparteGlobalConfig,
    APARTE_DEFAULT_LOCALE,
    AparteClient,
    AparteDirectTransport,
} from '@aparte/core';
import type { AparteThinkingSegment } from '@aparte/core';
import { arrowUpIcon, plusIcon } from '@aparte/core/icons';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import ts from '@shikijs/langs/typescript';
import js from '@shikijs/langs/javascript';
import css from '@shikijs/langs/css';
import html from '@shikijs/langs/html';
import bash from '@shikijs/langs/bash';
import json from '@shikijs/langs/json';
import githubDark from '@shikijs/themes/github-dark';
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
    resolveModelSource,
    saveSettings,
    settingsKeyResolver,
    type ExampleSettings,
} from './settings-store';
import { wireShell } from './shell';

// 0. This site speaks English, dates included. Core's default locale carries the
//    English strings but no language TAG on purpose — "format dates the browser's way"
//    is the right default for a library — so on a French machine the list's month
//    headings came out as "Juillet" under "Yesterday". A site that has chosen its
//    language says so, and the tag pins the formatting to it.
aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, tag: 'en' });

// 0b. Two glyphs of the product's: an up arrow on the send button, a plus on the
//     attachment button. The icon provider covers only the names it cares about; the
//     rest fall back to core's set.
aparteGlobalConfig.setIconProvider({ send: () => arrowUpIcon, paperclip: () => plusIcon });

// 1. Renderers + Markdown rendering for assistant replies.
registerDefaultRenderers();
setupMarkedProvider();
// Syntax highlighting, through the plugin's `/core` entry: the grammars are chosen
// here, so the bundle carries six of them and not the three hundred the convenience
// entry pulls in. A language outside this list renders as plain text. Awaited before
// the chat wires, because a block is highlighted when it settles and a provider
// registered later would miss the sample conversations' code. The light/dark pair
// follows `data-aparte-theme` on the root — the header's toggle.
setupShikiProviderFromHighlighter(
    await createHighlighterCore({
        themes: [githubDark],
        langs: [ts, js, css, html, bash, json],
        engine: createJavaScriptRegexEngine(),
    }),
    // The same dark theme on both sides: the product draws its code cards dark in light
    // mode too. A PAIR rather than one name, because a pair renders through CSS
    // variables (the card's own background can then take over) where a single theme
    // paints the block inline.
    { theme: { light: 'github-dark', dark: 'github-dark' } },
);
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
    const label = host.querySelector('.aparte-thinking-label');
    // A settled block with no measurement — a reply that came back from a store, or
    // was handed over as a string — thought, but nobody timed it. "Thinking…" would
    // say it still is.
    if (ms === undefined) { if (label) label.textContent = 'Thought'; return; }
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

// 2. The model. The SCRIPTED one by default (`@aparte/provider-scenario`): no server,
//    no key, the same replies every time — so a fresh clone shows a working site, and
//    a screenshot or a test of THIS app gets the same page twice. It declares a
//    context window so the gauge in the toolbar has something to measure against.
//
//    The settings view switches to a LOCAL server — Ollama and LM Studio, both
//    keyless — with the endpoint and token it holds (that is the same code path a
//    cloud provider uses). `?scenario` and `?local` in the URL override the setting:
//    a link a reader or a test can share.
const scenarioMode = resolveModelSource(loadSettings()) === 'scripted';
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
// With a local server the composer waits for the model selector to fetch and
// auto-select a model; the scripted model is the only one, so there is no selector
// and nothing to wait for.
aparteGlobalConfig.setRequireModelSelection(!scenarioMode);

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

// The model selector, only with a local server: one model needs no picker. Added to
// the toolbar AFTER providers are registered, so its async connectedCallback loads
// the model list with the providers already present (a static import would upgrade
// the element mid-setup and miss them).
if (!scenarioMode) {
    void import('@aparte/plugin-model-selector').then(() => {
        const selector = document.createElement('aparte-model-selector');
        selector.setAttribute('auto-select', '');
        selector.setAttribute('persist', '');
        selector.setAttribute('searchable', '');
        // In the header, where the product keeps its model picker; the toolbar row
        // under the composer stays empty and draws nothing.
        const slot = document.getElementById('model-slot');
        if (slot) slot.replaceChildren(selector);
        else document.querySelector('aparte-composer-toolbar')?.appendChild(selector);
    });
}

// ── Layout variants (`?layout=split`, `?layout=shell`, `?layout=page`) ───────
//
// Same convention as `?chats=2` below: off by default, so the page stays the
// single-chat reference, and reachable by a URL a reader can share.
//
//   ?layout=split — the chat in one pane of an <aparte-split>, an <iframe> in the
//                   other, inside the shell's main area. The FRAME is the point: a
//                   pointer that crosses an iframe is delivered to the frame's
//                   document and lost, which is what the split's drag scrim exists
//                   to prevent. Nothing else in this repo put a frame beside a chat,
//                   so nothing proved it. The two [data-aparte-split-pane] buttons
//                   join the header's actions for the stacked (narrow) case.
//   ?layout=shell — the same thing. The application shell — sidebar, drawer, header
//                   with its toggle — is the page's default now (index.html), so the
//                   variant only keeps the URL the E2E suite and the docs share.
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
function paneSwitcher(): DocumentFragment {
    const t = document.createElement('template');
    // `--surface` rather than a bare `.aparte-btn`: the plain form is a ghost, which
    // reads as two words of text rather than two controls when nothing sits beside it.
    t.innerHTML =
        '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="start">Chat</button>'
        + '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="end">Preview</button>';
    return t.content;
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
    const chatEl = document.querySelector<HTMLElement>('aparte-chat');
    const actions = document.querySelector<HTMLElement>('.aparte-app-header__actions');
    if (chatEl) {
        buildSplit(chatEl);
        actions?.prepend(paneSwitcher());
    }
}

// ── Chat wiring ──────────────────────────────────────────────────────────────
// No user-bubble handler: AparteClient echoes the user's message itself (its
// default) and streams the assistant reply. This file used to carry the handler
// every raw-core host wrote — and whoever forgot shipped a chat where the person
// cannot see what they typed, which is exactly why the client took the job.
const chat = document.querySelector('aparte-chat');

// The site around the chat: the conversation list, the header title, new chat, the
// theme toggle. It also hides the welcome heading once a conversation has messages;
// the starters under it are an <aparte-suggestions empty-only> and hide themselves.
wireShell();

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
    const view = document.querySelector<HTMLDialogElement>('#settings');
    if (!view) return;

    // A deep link opens it; the header button opens it through the kit's trigger.
    if (isSettingsView()) view.showModal();

    const sourceEls = [...view.querySelectorAll<HTMLInputElement>('input[name="model-source"]')];
    const promptEl = view.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const endpointEl = view.querySelector<HTMLInputElement>('#endpoint')!;
    const tokenEl = view.querySelector<HTMLInputElement>('#token')!;

    // The provider and the selector are registered once, at start: a change of model
    // source is applied by reloading the page, which is also what makes it visible.
    const startedWith = loadSettings().modelSource;

    // The system prompt, the endpoint and the token belong to the local server: the
    // scripted model reads none of them, so under it they are disabled rather than
    // editable and unread.
    const syncLocalFields = (): void => {
        const local = sourceEls.find((el) => el.checked)?.value === 'local';
        for (const el of [promptEl, endpointEl, tokenEl]) {
            el.disabled = !local;
            el.closest('.settings-group')?.toggleAttribute('data-disabled', !local);
        }
    };

    const render = (settings: ExampleSettings): void => {
        for (const el of sourceEls) el.checked = el.value === settings.modelSource;
        syncLocalFields();
        promptEl.value = settings.systemPrompt;
        endpointEl.value = settings.endpoint;
        tokenEl.value = settings.token;
    };
    render(loadSettings());

    const commit = (): void => {
        syncLocalFields();
        const next: ExampleSettings = {
            modelSource: sourceEls.find((el) => el.checked)?.value === 'local' ? 'local' : 'scripted',
            systemPrompt: promptEl.value,
            endpoint: endpointEl.value,
            token: tokenEl.value,
        };
        saveSettings(next);
        applySystemPrompt(aparteGlobalConfig, next);
        if (next.modelSource !== startedWith) location.reload();
    };
    // `input`, not `change`: a reader who types and navigates away without blurring
    // the field would otherwise lose what they typed.
    for (const el of [promptEl, endpointEl, tokenEl, ...sourceEls]) el.addEventListener('input', commit);

    view.querySelector<HTMLButtonElement>('#settings-reset')?.addEventListener('click', () => {
        render({ ...DEFAULT_SETTINGS });
        commit();
    });
}

wireSettingsView();
