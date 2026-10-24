/**
 * The Assistant template's behaviour, in the order an app writes it: the renderers (Markdown,
 * highlighting, the reasoning line), the model and its one tool, the client that runs the turns,
 * then the conversations (a manager over an in-memory store, bound to the chat by a controller),
 * and the three modes (src/templates/runtime.ts). The markup is Template.astro.
 */
import {
    APARTE_DEFAULT_LOCALE,
    AparteClient,
    AparteConversationController,
    AparteConversationManager,
    AparteDirectTransport,
    aparteGlobalConfig,
    registerDefaultRenderers,
} from '@aparte/core';
import type { AparteChatViewport, AparteConversationList, AparteSidebar, AparteToolCallSegment } from '@aparte/core';
import { moonIcon, searchIcon, sunIcon } from '@aparte/core/icons';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import '@aparte/plugin-model-selector';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import bash from '@shikijs/langs/bash';
import json from '@shikijs/langs/json';
import python from '@shikijs/langs/python';
import ts from '@shikijs/langs/typescript';
import githubDark from '@shikijs/themes/github-dark-default';
import githubLight from '@shikijs/themes/github-light-default';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { followTheme, reducedMotion, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { CONVERSATIONS, FIRST_CONVERSATION } from './conversations';
import { showReasoningDuration } from './reasoning';
import { PLAY_QUESTION, pickScenario, scenarios, titleFor, TRIP_RESULTS } from './scenario';
import { createMemoryStore } from './store';

type Composer = HTMLElement & { setValue(value: string): void; submit(): void };

// Awaited inside a function: the highlighter loads asynchronously, and the production build
// targets browsers that refuse a top-level await.
void main();

async function main(): Promise<void> {
    followTheme();
    // English, dates included: the list's date groups follow the locale's tag.
    aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, tag: 'en' });

    // Every renderer before anything renders: a bubble drawn before its Markdown or highlight
    // provider would show its raw text first and be drawn a second time when the provider lands.
    registerDefaultRenderers();
    setupStreamingMarkdownProvider();
    setupMarkedProvider();
    setupShikiProviderFromHighlighter(
        await createHighlighterCore({
            themes: [githubLight, githubDark],
            langs: [bash, json, python, ts],
            engine: createJavaScriptRegexEngine(),
        }),
        { theme: { light: 'github-light-default', dark: 'github-dark-default' } },
    );
    showReasoningDuration();

    // The model: a script with three models to pick from. Tools need `function_calling`.
    const model = createScenarioProvider({
        id: 'assistant',
        name: 'Assistant',
        scenarios: scenarios(reducedMotion() ? 0 : 900),
        match: pickScenario,
        pacing: replyPacing(),
        models: [
            { id: 'large', name: 'Large', contextWindow: 200_000, capabilities: ['streaming', 'function_calling'] },
            { id: 'fast', name: 'Fast', contextWindow: 128_000, capabilities: ['streaming', 'function_calling'] },
            { id: 'reasoning', name: 'Think', contextWindow: 200_000, capabilities: ['streaming', 'function_calling', 'reasoning'] },
        ],
    });
    aparteGlobalConfig.registerAIProvider(model);
    aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'large' });
    aparteGlobalConfig.registerTool(
        {
            name: 'web_search',
            description: 'Search the web and return the top pages.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        },
        async (call) => ({ toolCallId: call.id, content: TRIP_RESULTS }),
    );
    // A person reads the search the way a chat app shows it: what was searched, in words, and
    // the pages it found behind the line, never the call's JSON.
    aparteGlobalConfig.registerIcons({ search: () => searchIcon });
    aparteGlobalConfig.registerToolDisplay('web_search', {
        label: (segment) => (segment.status === 'resolved' ? 'Searched the web' : 'Searching the web'),
        icon: 'search',
        summary: (segment) => `“${String(segment.toolCall.input['query'] ?? '')}”`,
        details: sourcesOf,
    });
    aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
    // Retry and edit are honoured by the client below, so the bubbles may offer them.
    aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
    new AparteClient().start();

    const chat = document.querySelector<HTMLElement>('.assistant aparte-chat');
    const viewport = chat?.querySelector<AparteChatViewport>('aparte-chat-viewport');
    const sidebar = document.querySelector<AparteSidebar>('.assistant aparte-sidebar');
    const list = document.querySelector<AparteConversationList>('.assistant aparte-conversation-list');
    const heading = document.querySelector<HTMLElement>('[data-assistant-title]');
    if (!chat || !viewport || !sidebar || !list || !heading) return;

    // The conversations: the manager over the store, registered for every element (the list's
    // `manage` renames and deletes through it), and the controller that binds the chat to it.
    // The controller loads a conversation when the list selects it, creates one on the first
    // message of a new chat, and saves every finished turn.
    const manager = new AparteConversationManager(createMemoryStore(CONVERSATIONS), { titleProvider: titleFor });
    aparteGlobalConfig.setConversationManager(manager);
    const controller = new AparteConversationController({
        hostId: chat.id,
        host: chat,
        getMessages: () => viewport.getMessages(),
        setMessages: (messages) => viewport.setMessages(messages),
        appendMessage: (message) => viewport.appendMessage(message),
        clearMessages: (options) => viewport.clearAll(options),
        setLoading: (on) => viewport.setLoading(on),
        exportTree: () => viewport.exportTree(),
        importTree: (tree) => viewport.importTree(tree),
    });
    controller.bind();

    // The list and the header follow the manager.
    manager.subscribe(() => {
        list.conversations = manager.activeConversations.map(({ id, title, updatedAt, pinnedAt }) => ({ id, title, updatedAt, pinnedAt }));
        const active = manager.active;
        if (active) list.setAttribute('active-id', active.id);
        else list.removeAttribute('active-id');
        heading.textContent = active?.title || 'New chat';
    });

    // On a phone the sidebar is a drawer over the chat: picking a conversation, or starting a
    // new one, is done with it.
    const closeDrawer = (): void => {
        if (sidebar.drawer) sidebar.close();
    };
    list.addEventListener('aparte-conversation-select', closeDrawer);
    document.querySelector('[data-assistant-new]')?.addEventListener('click', () => {
        closeDrawer();
        void controller.setConversationId(null);
        chat.querySelector<HTMLElement>('aparte-composer-input')?.focus();
    });
    wireThemeToggle(document.querySelector<HTMLButtonElement>('[data-assistant-theme]'));

    await manager.init();
    const mode = templateMode();
    if (mode === 'play') {
        // The showcase starts on a new chat and asks its question there.
        const composer = chat.querySelector<Composer>('aparte-composer');
        if (composer) whenShown(() => void typeAndSend(composer, PLAY_QUESTION));
    } else {
        await controller.setConversationId(FIRST_CONVERSATION);
    }
    // The welcome state, now that the first view is up (see Template.astro).
    chat.setAttribute('center-empty', '');
}

/**
 * What a finished search shows behind its line: the pages it found, title, site and the line
 * under each. Built as elements, so nothing the tool returned goes through `innerHTML`; a
 * link is kept only when it is http(s). Nothing yet while the search runs, nor for a result
 * that is not the list it should be.
 */
function sourcesOf(segment: AparteToolCallSegment): HTMLElement | string {
    if (segment.status !== 'resolved') return '';
    let hits: unknown;
    try {
        hits = JSON.parse(segment.result ?? '');
    } catch {
        return '';
    }
    if (!Array.isArray(hits) || hits.length === 0) return '';
    const list = document.createElement('ol');
    list.className = 'assistant-sources';
    for (const hit of hits as { title?: unknown; url?: unknown; snippet?: unknown }[]) {
        const url = typeof hit.url === 'string' && /^https?:\/\//.test(hit.url) ? hit.url : '';
        // Read here, not later: a string the pattern lets through can still fail to parse,
        // and one bad link must cost its site line, not the whole list.
        let host = '';
        try {
            host = url ? new URL(url).hostname : '';
        } catch {
            host = '';
        }
        const item = document.createElement('li');
        const title = document.createElement(url ? 'a' : 'span');
        title.className = 'assistant-sources__title';
        title.textContent = String(hit.title ?? url);
        if (title instanceof HTMLAnchorElement) {
            title.href = url;
            title.target = '_blank';
            title.rel = 'noopener';
        }
        item.append(title);
        if (host) {
            const site = document.createElement('span');
            site.className = 'assistant-sources__site';
            site.textContent = host;
            item.append(site);
        }
        if (typeof hit.snippet === 'string') {
            const line = document.createElement('p');
            line.className = 'assistant-sources__line';
            line.textContent = hit.snippet;
            item.append(line);
        }
        list.append(item);
    }
    return list;
}

/** Light or dark for this page, on the two attributes the site and core's tokens read. */
function wireThemeToggle(button: HTMLButtonElement | null): void {
    if (!button) return;
    const root = document.documentElement;
    const paint = (): void => {
        const dark = root.dataset.aparteTheme === 'dark';
        // Static SVG strings from core's extended icon set.
        button.innerHTML = dark ? sunIcon : moonIcon;
        button.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
    };
    button.addEventListener('click', () => {
        const next = root.dataset.aparteTheme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        root.dataset.aparteTheme = next;
        // The site's own key, so a reload and the system's scheme agree with this choice.
        try {
            localStorage.setItem('starlight-theme', next);
        } catch {
            // Storage can be blocked; the choice then holds for this page only.
        }
    });
    // The site's own changes (a framing page, another tab, the system) repaint it too.
    new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-aparte-theme'] });
    paint();
}
