/**
 * The chat site's setup, the same for the five examples: what a page does BEFORE it
 * renders a chat. One function, called once, in every framework and in none.
 *
 * Everything here is what an app writes, in the order an app writes it: the locale
 * and two glyphs, the renderers and the markdown, highlighting, the tool plugins,
 * the "Thought for 1.4s" line, the model (scripted by default, a local server from
 * the settings), the transport, the affordances this site can honour, the client
 * that drives the turns, compaction, and the image lightbox. Nothing in this file
 * knows which framework renders the page.
 */
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
// it. Without a tool at all, the whole tools path — approval, elicitation, the
// guide — is undemonstrated: asking a local model to "use the question tool" gets a
// truthful "I have no such tool".
import { setupAskUser } from '@aparte/plugin-ask-user';
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { runStreamAgent } from '@aparte/engine';
import { setupCompaction } from '@aparte/plugin-compaction';
import { createScenarioProvider, showcase } from '@aparte/provider-scenario';
import { applySystemPrompt, loadSettings, resolveModelSource, settingsKeyResolver } from './settings-store';

export interface SiteSetup {
    /** The scripted model answers (no server, no key): the default, and `?scenario`. */
    scenarioMode: boolean;
}

let done: Promise<SiteSetup> | null = null;

/** Set the page up once; a second call returns the first result. */
export function setupSite(): Promise<SiteSetup> {
    done ??= run();
    return done;
}

async function run(): Promise<SiteSetup> {
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

    // 2. The model. The SCRIPTED one by default (`@aparte/provider-scenario`): no server,
    //    no key, the same replies every time — so a fresh clone shows a working site, and
    //    a screenshot or a test of THIS app gets the same page twice. It declares a
    //    context window so a gauge has something to measure against.
    //
    //    The settings switch to a LOCAL server — Ollama and LM Studio, both keyless —
    //    with the endpoint and token they hold (that is the same code path a cloud
    //    provider uses). `?scenario` and `?local` in the URL override the setting: a
    //    link a reader or a test can share.
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

    // 4. Opt into the affordances THIS site can honor. Retry and edit need the client
    //    below to re-send and rewrite; the image tile needs the lightbox at the bottom
    //    of this file. What it does not handle (the ⓘ details popover, running a
    //    terminal command) stays out of the UI rather than showing a dead button.
    aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
    aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });

    // 5. Drive the turn with @aparte/engine's headless loop instead of core's inline
    //    one. This is the `streamRunner` seam; core works identically without it —
    //    remove the option and the inline loop runs, which the engine parity suite
    //    asserts. Wired here because a capability with no in-repo consumer is a
    //    contract maintained for nobody (ratified decision #7).
    const client = new AparteClient({
        streamRunner: runStreamAgent,
        // The endpoint + token the settings hold, for ANY provider. The record form
        // (`{ apiKey, endpoint }`) is the only runtime channel for an endpoint, and it
        // is honoured on both the chat and the /models path.
        keyResolver: settingsKeyResolver(loadSettings),
    });
    // The stored system prompt has to be on the config before the first turn.
    applySystemPrompt(aparteGlobalConfig, loadSettings());
    client.start(); // listens for aparte-send/retry/edit and streams replies into the chat

    // Compaction: an `<aparte-context auto-compact>` asks on reaching 90 %, and this
    // answers — the newest turns that still fit the model's window stay verbatim, the
    // rest is summarised through the same provider, key and endpoint the chat uses.
    setupCompaction({ keyResolver: settingsKeyResolver(loadSettings) });

    wireAttachmentLightbox();
    return { scenarioMode };
}

/**
 * The model selector, only with a local server: one model needs no picker. Mounted
 * AFTER providers are registered, so its async connectedCallback loads the model
 * list with the providers already present (a static import would upgrade the
 * element mid-setup and miss them). In the header, where the product keeps its
 * picker; `fallback` is where it goes when the page has no such slot.
 */
export function mountModelSelector(slot: HTMLElement | null, fallback?: HTMLElement | null): void {
    // `?selector=toolbar`: the picker in the composer's toolbar row instead of the
    // header — the row core lays out, which the browser suite measures on every example.
    const inToolbar = new URLSearchParams(location.search).get('selector') === 'toolbar';
    void import('@aparte/plugin-model-selector').then(() => {
        const selector = document.createElement('aparte-model-selector');
        selector.setAttribute('auto-select', '');
        selector.setAttribute('persist', '');
        selector.setAttribute('searchable', '');
        if (slot && !(inToolbar && fallback)) { slot.replaceChildren(selector); return; }
        // At the end of the row: DOM order plus `margin-inline-start: auto`, the one
        // placement rule the toolbar has (no left/right — a logical property, so the
        // control changes sides with the reading direction).
        selector.style.marginInlineStart = 'auto';
        fallback?.appendChild(selector);
    });
}

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

/**
 * The image-tile preview: core only ASKS (`aparte-attachment-preview`), the modal
 * is the app's. So the site declares it AND actually opens something — a declaration
 * with no listener behind it is a dead button.
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
