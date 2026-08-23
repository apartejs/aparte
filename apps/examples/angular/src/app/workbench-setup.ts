/**
 * Two chats, two configs, one page — the thing every wrapper's `config` prop
 * promises and nothing here demonstrated.
 *
 * Why this view exists. Three audits in a row hit the same surface: a plugin, a
 * renderer or a presenter registering itself on the page-global singleton while a
 * chat given its own `AparteConfig` resolved a different object and found nothing
 * there. The worst of them was silent AND it lied to the model — an
 * `<aparte-elicitation>` mounted under a wrapper registered on the global, so
 * `requestUserInput()` resolved the chat's config, found no presenter, and
 * answered `cancel`. The model heard the user refuse a question the user was never
 * shown.
 *
 * None of it was visible anywhere: no example passed a `config` prop, wired
 * elicitation, or registered a tool that needs the user. So the bug class had no
 * example, and the browser suite had nothing to run.
 *
 * The mount ORDER is the whole point. Every wrapper calls `AparteChatHost.bind()`
 * — which is what attaches the config boundary — from a post-mount hook (React
 * `useEffect`, Vue `onMounted`, Svelte `onMount`, Angular `ngAfterViewInit`). So
 * the children connect BEFORE the boundary exists, every time, in all four. Raw
 * core does not reproduce that, which is why this view lives in the wrapper
 * examples rather than in `vanilla`.
 */
import {
    AparteConfig,
    AparteClient,
    AparteDirectTransport,
    type AparteAIProvider,
} from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupAskQuestion } from '@aparte/plugin-ask-question';
import '@aparte/plugin-ask-question';   // registers <aparte-ask-question>, the semantic alias

/** One workbench pane: a label a human reads, and the config that backs it. */
export interface WorkbenchPane {
    /** Shown in the pane header, and what a test locates the pane by. */
    readonly title: string;
    /** The provider this pane talks to — the visible proof the two are independent. */
    readonly providerLabel: string;
    readonly config: AparteConfig;
}

/**
 * Build one pane's config from scratch.
 *
 * Everything is registered on `cfg`, never on `aparteGlobalConfig`: the markdown
 * renderer, the provider, the transport, the model choice, and the `ask_question`
 * tool whose handler suspends the turn on `requestUserInput`. A single call left on
 * the global would make this whole view prove the opposite of what it claims.
 */
function makePane(title: string, providerLabel: string, provider: AparteAIProvider, modelHint: string): WorkbenchPane {
    const config = new AparteConfig();

    setupMarkedProvider(undefined, config);
    config.registerAIProvider(provider);
    config.setTransport(new AparteDirectTransport({ byok: true }));
    config.setModelConfig({ defaultProvider: provider.id, defaultModel: modelHint });

    // The plugin registers the tool AND hides its pill; its handler calls
    // `requestUserInput`, which is answered by the <aparte-elicitation> mounted
    // inside THIS pane's chat. That is the path the CRITICAL broke.
    setupAskQuestion(config);

    // Retry/edit are honoured by the client below, so they may be shown.
    config.setBubbleActions({ retry: true, edit: true });

    // One client per config. `{ config }` is what scopes the loop — without it the
    // client would drive this chat from the global singleton and the pane's own
    // registrations would never be read.
    new AparteClient({ config }).start();

    return { title, providerLabel, config };
}

let panes: readonly [WorkbenchPane, WorkbenchPane] | null = null;

/**
 * The two panes, built once. Idempotent: a framework that re-renders (or mounts
 * twice in React's development StrictMode) must not build a second pair of configs
 * and a second pair of clients.
 */
export function workbenchPanes(): readonly [WorkbenchPane, WorkbenchPane] {
    if (panes) return panes;
    // Two LOCAL providers, so neither pane needs a key and both are deterministic.
    // They also differ, which is the visible evidence that two configs are in play:
    // a single shared config could not label the panes differently.
    panes = [
        makePane('Ollama', 'localhost:11434', createOpenAICompatProvider(presets.OLLAMA), 'llama3.2'),
        makePane('LM Studio', 'localhost:1234', createOpenAICompatProvider(presets.LMSTUDIO), 'local-model'),
    ];
    return panes;
}

/** Is the workbench the requested view? A link, not a click — so a test can deep-link. */
export function isWorkbenchView(): boolean {
    return new URLSearchParams(window.location.search).get('view') === 'workbench';
}
