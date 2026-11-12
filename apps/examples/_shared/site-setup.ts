/**
 * The chat site's setup, the same for the five examples: what a page does BEFORE it
 * renders a chat. One function, called once, in every framework and in none.
 *
 * Everything here is what an app writes, in the order an app writes it: the locale
 * and two glyphs, the renderers and the markdown, highlighting, the tool plugins,
 * how the tools read, the model (scripted by default, a local server from
 * the settings), the transport, the affordances this site can honour, the client
 * that drives the turns, compaction, and the image lightbox. Nothing in this file
 * knows which framework renders the page.
 */
import {
    registerDefaultRenderers,
    aparteGlobalConfig,
    APARTE_DEFAULT_LOCALE,
    AparteClient,
    AparteDirectTransport,
    contentToText,
    createAgentStreamRunner,
} from '@aparte/core';
import type { AparteToolCallSegment } from '@aparte/core';
import { arrowUpIcon, plusIcon, searchIcon, globeIcon } from '@aparte/core/icons';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { createAgUiRunner } from '@aparte/runner-ag-ui';
import { createN8nRunner, setupN8nButtons } from '@aparte/runner-n8n';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { setupKatex } from '@aparte/plugin-katex';
import { setupMermaid } from '@aparte/plugin-mermaid';
import { setupPluginCard } from './plugin-card';
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
// A STATIC import: it brings `<aparte-approval-mode>` with it, and the element defines
// itself. The switch sits in the composer's toolbar of all six sites, so it has to be
// defined before the first render — a dynamic import would leave the tag inert until it
// landed, which is the right trade only for something the page can do without.
import { setupApproval } from '@aparte/plugin-approval';
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { runStreamAgent } from '@aparte/engine';
import { setupCompaction } from '@aparte/plugin-compaction';
import { setupSubagents } from '@aparte/plugin-subagents';
import type { AparteTrigger } from '@aparte/plugin-triggers';
import { createScenarioProvider, scenarioSubagentTool } from '@aparte/provider-scenario';
import { showcase } from '@aparte/provider-scenario/showcase';
import { applySystemPrompt, loadSettings, resolveModelSource, settingsKeyResolver } from './settings-store';
import { DELEGATE, delegateLabel, REFUSAL, routeDelegation, SUBAGENT_SCENARIOS } from './sub-agents';

/**
 * The four tools the "ship it" chain calls, and what they answer. An app's own names, an
 * app's own results: the library never sees either. The results are canned, so the four
 * work under any model — which is what lets the approval switch rule the same names
 * whether the scripted provider or a local server is answering.
 */
const CHAIN_TOOLS = [
    ['search_docs', 'Search the documentation.'],
    ['read_file', 'Read a file from the workspace.'],
    ['write_file', 'Write a file in the workspace.'],
    ['run_command', 'Run a shell command in the workspace.'],
] as const;

const CANNED: Record<string, string> = {
    search_docs: 'Found 3 pages: release checklist, versioning, the publish script.',
    read_file: '## 0.16.11\n\n- the previous release',
    write_file: 'Wrote 4 lines to CHANGELOG.md.',
    run_command: 'Build finished in 12.4s. 0 errors.',
};

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
    //     rest fall back to core's set. And two names core does not draw at all, for the
    //     tools below — `registerIcons` adds them to the set rather than replacing it.
    aparteGlobalConfig.setIconProvider({ send: () => arrowUpIcon, paperclip: () => plusIcon });
    aparteGlobalConfig.registerIcons({ search: () => searchIcon, globe: () => globeIcon });

    // 1. Renderers + Markdown rendering for assistant replies.
    registerDefaultRenderers();
    // Maths and diagrams, each loaded on its first formula or diagram. Registered before the
    // Markdown provider, which recognises maths once a `math` renderer is there.
    setupKatex();
    setupMermaid();
    // Which Markdown provider streams a reply (`?markdown=`): marked redrawing the reply
    // (the default), marked's streaming entry, or the incremental streaming-markdown with
    // marked for a finished reply — the three a site can choose, all drawing maths.
    const markdown = new URLSearchParams(location.search).get('markdown');
    if (markdown === 'marked-streaming') setupMarkedStreamingProvider();
    else {
        setupMarkedProvider();
        if (markdown === 'smd') setupStreamingMarkdownProvider();
    }
    // Syntax highlighting, through the plugin's `/core` entry: the grammars are chosen
    // here, so the bundle carries six of them and not the three hundred the convenience
    // entry pulls in. A language outside this list renders as plain text. Awaited before
    // the chat wires, so the sample conversations are drawn highlighted once, not plain
    // first and again when the highlighter lands. The light/dark pair
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

    // 1b. "Thought for 8s" on a settled reasoning block. Core draws "Thought" and leaves
    //     the number to the app, because it measures it in the browser — from the first
    //     reasoning delta to the last — which is the model's thinking time only when the
    //     provider streams its reasoning. Both of this site's models do, so it turns the
    //     duration on. (A product that wants "8.2s · 1.2k tokens" wraps the renderer.)
    aparteGlobalConfig.setSegmentDefaults('thinking', { showDuration: true });

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
    //    `?agent=<url>`: the LOOP runs on a server (`_shared/agent-server.mjs`, the browser
    //    suite starts one), with `get_weather` there as a server tool that needs a person.
    //    The page keeps its panel, its policy and its browser tools; only the loop moves.
    const agentUrl = new URLSearchParams(location.search).get('agent');
    //    `?agui=<url>`: an AG-UI agent runs the turn on ITS server (the same file serves a
    //    scripted one), and the page draws it through `@aparte/runner-ag-ui`.
    const agUiUrl = new URLSearchParams(location.search).get('agui');
    //    `&agui-framing=relaxed`: an agent that frames its runs its own way — TanStack AI, a
    //    RUN_FINISHED per model step — read through the runner's `relaxedRunFraming`.
    const agUiRelaxed = new URLSearchParams(location.search).get('agui-framing') === 'relaxed';
    const agUiRunner = agUiUrl ? createAgUiRunner({ endpoint: agUiUrl, relaxedRunFraming: agUiRelaxed }) : undefined;
    //    `?n8n=<url>`: an n8n chat workflow answers the turn (the same file serves a
    //    scripted Chat Trigger), and the page draws it through `@aparte/runner-n8n`.
    const n8nUrl = new URLSearchParams(location.search).get('n8n');
    const n8nRunner = n8nUrl ? createN8nRunner({ webhookUrl: n8nUrl }) : undefined;
    //    A Chat node's buttons (a workflow with response nodes) are asked at the composer.
    if (n8nUrl) setupN8nButtons();
    if (scenarioMode) {
        const scripted = createScenarioProvider({
            scenarios: {
                // The three sub-agent paths (sub-agents.ts), first: their prompts also say
                // "release", which the showcase's `release` listens for.
                ...SUBAGENT_SCENARIOS,
                ...showcase,
                // Where a refusal lands, and it needs `match` below to get there: an
                // `after:` route keys on WHICH tool ran, never on what its result said,
                // and a refusal is a result like any other as far as the loop is
                // concerned. Without this the model would go on to the next step of the
                // chain as if the user had said yes.
                refused: 'Understood — I have not run it. Tell me if you change your mind.',
            },
            // The one branch the default rule cannot express. Everything else falls
            // through to it by returning `undefined`.
            match: (request) => {
                const last = request.messages[request.messages.length - 1];
                if (last?.role !== 'tool') return undefined;
                return REFUSAL.test(contentToText(last.content)) ? 'refused' : routeDelegation(request);
            },
            models: [{ id: 'scripted', name: 'Scripted model', contextWindow: 8000, capabilities: ['streaming', 'function_calling'] }],
        });
        aparteGlobalConfig.registerAIProvider(scripted);
        // The tool the scripted model delegates through: it runs each sub-agent's script as a
        // nested run of the real loop, so their calls go through the handlers and the
        // approval policy below. Not under a server or an agent of its own, like the weather.
        if (!agentUrl && !agUiUrl && !n8nUrl) {
            const { tool, handler } = scenarioSubagentTool(scripted);
            aparteGlobalConfig.registerTool(tool, handler);
        }
        // The showcase's weather turn calls this tool. An app that never registered it
        // would see the call fail — also a scenario, but the round-trip is the point here.
        //
        // `needsApproval` and NO class in the classification below, on purpose: this is
        // the tool that shows what an unclassified name does under each mode — plan, ask
        // and auto-edit all put it to the user (its own flag decides), and `auto` lets it
        // through, because auto is auto.
        // Under `?agent` the weather tool is the SERVER's: a page tool of the same name
        // would be sent as a browser tool, and the server refuses the clash. An n8n
        // workflow runs its own tools and is sent none.
        if (!agentUrl && !agUiUrl && !n8nUrl) aparteGlobalConfig.registerTool(
            {
                name: 'get_weather',
                description: 'Current weather for a city.',
                inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
                needsApproval: true,
            },
            async (call) => ({ toolCallId: call.id, content: `Cloudy, 14 °C in ${String(call.input['city'] ?? 'Lille')}.` }),
        );
    } else {
        aparteGlobalConfig.registerAIProvider(
            createOpenAICompatProvider(presets.OLLAMA),
            createOpenAICompatProvider(presets.LMSTUDIO),
        );
    }

    // 2a. The four tools the "ship it" chain calls, with canned results. The NAMES are
    //     the app's — no library can know that `run_command` executes and `search_docs`
    //     reads, which is exactly why the classification below is written here and not
    //     shipped by the plugin.
    //
    //     Registered whichever model answers, and that placement is the point: the
    //     classification below would otherwise name four tools that exist on the scripted
    //     path only, so on `?local` every mode would rule the same nothing. The handlers
    //     are canned and say so, which is what lets them serve both models.
    for (const [name, description] of CHAIN_TOOLS) {
        aparteGlobalConfig.registerTool(
            { name, description, inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
            async (call) => ({ toolCallId: call.id, content: CANNED[name] ?? '' }),
        );
    }

    // 2a'. How those calls read. A tool's NAME is the app's wire format, and core shows
    //      it until the app says how a person should read the call: a label, an icon,
    //      and what the call targets. A row reads "Writing a file… CHANGELOG.md", then
    //      "Wrote a file CHANGELOG.md", rather than `write_file`, and the approval question
    //      asks about the plain line: "Allow Write file CHANGELOG.md?".
    const arg = (segment: AparteToolCallSegment, ...keys: string[]): string => {
        for (const key of keys) {
            const value = segment.toolCall.input[key];
            if (typeof value === 'string') return value;
        }
        return '';
    };
    // A quiet row says nothing once a call is done, so the label's tense does: running,
    // done, and the plain name for the rest — a wait for approval ("Allow Weather Lille?"),
    // a refusal, a failure.
    const tense = (running: string, done: string, name: string) => (segment: AparteToolCallSegment): string =>
        segment.status === 'pending' ? running : segment.status === 'resolved' ? done : name;
    aparteGlobalConfig.registerToolDisplay('get_weather', { label: tense('Checking the weather…', 'Checked the weather', 'Weather'), icon: 'globe', summary: (s) => arg(s, 'city') });
    // `?plugin-card`: the same call drawn by `@aparte/plugin-cards` (see `plugin-card.ts`).
    setupPluginCard();
    aparteGlobalConfig.registerToolDisplay('search_docs', { label: tense('Searching the docs…', 'Searched the docs', 'Search docs'), icon: 'search', summary: (s) => arg(s, 'query') });
    aparteGlobalConfig.registerToolDisplay('read_file', { label: tense('Reading a file…', 'Read a file', 'Read file'), icon: 'file', summary: (s) => arg(s, 'path') });
    aparteGlobalConfig.registerToolDisplay('write_file', { label: tense('Writing a file…', 'Wrote a file', 'Write file'), icon: 'edit', summary: (s) => arg(s, 'path') });
    aparteGlobalConfig.registerToolDisplay('run_command', { label: tense('Running a command…', 'Ran a command', 'Run command'), icon: 'terminal', summary: (s) => arg(s, 'cmd', 'command') });
    // A call that opened several sub-agents says so, above their lines; one that opened ONE is
    // that sub-agent's line, and keeps the name `@aparte/plugin-subagents` gives it.
    aparteGlobalConfig.registerToolDisplay(DELEGATE, { label: delegateLabel });

    // 2a''. Sub-agents: one line each — its name, its task, what it is doing, "1 tool · 3 s" —
    //       with its own text and calls kept out of the reply. Whichever model answers: an AG-UI
    //       agent's sub-agents get the same lines as the scripted model's.
    setupSubagents();

    // 2b. Approval modes over those names. Core owns the mechanism — a policy on the
    //     config, the gate in the loop, the panel at the composer, the refusal the model
    //     reads; `@aparte/plugin-approval` is the piece between: which of THIS app's
    //     names read, write or execute, and the switch in the composer's toolbar.
    //
    //     Installed whichever model answers, over the four names above. The switch is in
    //     the toolbar of every site, and a control that cannot act is not a control
    //     (ratified decision #8) — a local model asked to write a file gets the same gate
    //     the scripted one gets.
    //
    //     `ask` to start, so a first visit actually sees the panel. `plan` refuses the
    //     write and the command with a sentence the model reads and answers; `auto-edit`
    //     lets the write through and still asks before the command; `auto` runs the
    //     whole four-step chain without a question.
    setupApproval({
        classify: {
            read: ['search_docs', 'read_file'],
            write: ['write_file'],
            exec: ['run_command'],
        },
        mode: 'ask',
    });

    // 3. Browser talks to the provider directly; the key (if any) stays in the browser.
    // With a local server the composer waits for the model selector to fetch and
    // auto-select a model; the scripted model is the only one, so there is no selector
    // and nothing to wait for.
    aparteGlobalConfig.setRequireModelSelection(!scenarioMode);
    aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

    // 4. Opt into the affordances THIS site can honor. Copy core does alone, and a chat
    //    site wants it under every message (it is off by default). Retry and edit need the client
    //    below to re-send and rewrite; the image tile needs the lightbox at the bottom
    //    of this file. What it does not handle (the ⓘ details popover, running a
    //    terminal command) stays out of the UI rather than showing a dead button.
    //    Not on an n8n workflow: n8n keeps every message it was sent, so a retried or
    //    edited turn would reach an agent that remembers the first one.
    aparteGlobalConfig.setBubbleActions({ copy: true, retry: !n8nUrl, edit: !n8nUrl });
    if (new URLSearchParams(location.search).has('feedback')) {
        aparteGlobalConfig.setBubbleActions({ feedback: true, feedbackReasons: ['Not accurate', 'Too long', 'Off topic'] });
    }
    aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });

    // 5. Drive the turn with @aparte/engine's headless loop instead of core's inline
    //    one. This is the `streamRunner` seam; core works identically without it —
    //    remove the option and the inline loop runs, which the engine parity suite
    //    asserts. Wired here because a capability with no in-repo consumer is a
    //    contract maintained for nobody (ratified decision #7).
    const client = new AparteClient({
        streamRunner: agUiRunner ?? n8nRunner ?? (agentUrl ? createAgentStreamRunner({ endpoint: agentUrl }) : runStreamAgent),
        // The endpoint + token the settings hold, for ANY provider. The record form
        // (`{ apiKey, endpoint }`) is the only runtime channel for an endpoint, and it
        // is honoured on both the chat and the /models path.
        keyResolver: settingsKeyResolver(loadSettings),
    });
    // The stored system prompt has to be on the config before the first turn.
    applySystemPrompt(aparteGlobalConfig, loadSettings());
    client.start(); // listens for aparte-send/retry/edit and streams replies into the chat

    // Compaction: past 80 % of the model's window, the newest turns that still fit stay
    // verbatim and the rest is summarised through the same provider, key and endpoint
    // the chat uses.
    setupCompaction({ keyResolver: settingsKeyResolver(loadSettings) });

    // Two options no site turns on by default, for the browser suite: `?turns=folded` folds a
    // turn's steps behind one line, `?commands` opens the menus of @aparte/plugin-triggers.
    const siteParams = new URLSearchParams(location.search);
    if (siteParams.get('turns') === 'folded') aparteGlobalConfig.setTurnSummary(true);
    if (siteParams.has('caret')) aparteGlobalConfig.setStreamingCaret(true);
    if (siteParams.has('dates')) aparteGlobalConfig.setDateSeparators(true);
    if (siteParams.has('commands')) mountTriggers();

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

/** The people `@` searches, with a little latency so the list really is asked for. */
const PEOPLE = [{ id: 1, name: 'Paul' }, { id: 2, name: 'Anna' }, { id: 3, name: 'Ines' }];

const SITE_TRIGGERS: readonly AparteTrigger[] = [
    { char: '/', at: 'message', commands: true },
    {
        char: '@',
        kind: 'mention',
        debounce: 20,
        items: async (query) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return PEOPLE
                .filter(({ name }) => name.toLowerCase().includes(query.toLowerCase()))
                .map(({ id, name }) => ({ id: String(id), label: name, insert: { label: name, text: `@${name.toLowerCase()}`, kind: 'mention', data: { id } } }));
        },
    },
    {
        char: '#',
        items: [
            { id: 'files', label: 'Files', group: 'Places', children: [{ id: 'report', label: 'report.pdf', insert: { label: 'report.pdf', text: '[report.pdf]', kind: 'file' } }] },
            { id: 'bug', label: 'bug', group: 'Tags' },
            { id: 'idea', label: 'idea', group: 'Tags' },
        ],
    },
];

/** Into the composer once a framework has drawn it: the element draws nothing of its own. */
function mountTriggers(): void {
    void Promise.all([import('@aparte/plugin-triggers'), import('@aparte/plugin-triggers/commands')]).then(([, { setupCommands }]) => {
        setupCommands({ onNew: () => document.getElementById('new-chat')?.click() });
        const place = (): void => {
            const composer = document.querySelector('aparte-composer');
            if (!composer) {
                requestAnimationFrame(place);
                return;
            }
            const element = document.createElement('aparte-triggers');
            element.triggers = SITE_TRIGGERS;
            composer.appendChild(element);
        };
        place();
    });
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
