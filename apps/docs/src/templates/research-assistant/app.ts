/**
 * The research assistant's behaviour: a scripted model behind the real client, the three
 * tools of a research run, the threads in the sidebar, the report pane, and the three modes
 * (src/templates/runtime.ts).
 *
 * The pane is a function of the thread: whichever thread is open, it shows the last report
 * that thread's create_artifact call produced, and a new report lands in it the moment the
 * tool returns.
 */
import {
    aparteGlobalConfig,
    AparteClient,
    AparteConversationController,
    AparteConversationManager,
    AparteDirectTransport,
    APARTE_DEFAULT_LOCALE,
    type AparteChatViewport,
    type AparteConversation,
    type AparteConversationList,
    type AparteMessage,
    type AparteStorageAdapter,
    type AparteToolCallSegment,
} from '@aparte/core';
import { moonIcon, sunIcon } from '@aparte/core/icons';
import { artifactFromToolCall, artifactHandler, createArtifactTool, setupArtifacts } from '@aparte/plugin-artifacts';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { followTheme, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { registerResearchRenderers } from './renderers';
import { createReportPane, type Report } from './report';
import { PLAY_QUESTION, SCENARIOS, SUGGESTIONS, WEIGH_QUESTION } from './scenario';
import { THREADS, WHEELS_ID } from './threads';
import { readPage, readPageTool, webSearch, webSearchTool } from './tools';

type Composer = HTMLElement & { setValue(value: string): void; submit(): void };
type Split = HTMLElement & { showPane(pane: 'start' | 'end'): void };
type Sidebar = HTMLElement & { readonly drawer: boolean; close(): void };

const mode = templateMode();
followTheme();

// The page's language (the list's date groups follow it), then Markdown, before anything
// renders: a bubble drawn before its renderer is set keeps its raw text.
aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, tag: 'en' });
setupMarkedProvider();
setupStreamingMarkdownProvider();

/** An element of Template.astro's markup, which this file cannot run without. */
function part<T extends Element>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error(`research-assistant: ${selector} is missing from the markup.`);
    return found;
}

const chat = part<HTMLElement>('aparte-chat');
const viewport = part<AparteChatViewport>('aparte-chat-viewport');
const composer = part<Composer>('aparte-composer');
const list = part<AparteConversationList>('aparte-conversation-list');
const split = part<Split>('aparte-split');
const sidebar = part<Sidebar>('aparte-sidebar');
const title = part<HTMLElement>('[data-research-title]');
const paneButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-aparte-split-pane]')];

const pane = createReportPane(part<HTMLElement>('.research-pane'));

/** Which pane the header's Chat / Report pair says is shown, on a phone where only one is. */
function markPane(which: 'start' | 'end'): void {
    for (const button of paneButtons) button.setAttribute('aria-pressed', String(button.dataset['aparteSplitPane'] === which));
}
// The split switches itself on these buttons' clicks; the pressed state is the page's to keep.
for (const button of paneButtons) button.addEventListener('click', () => markPane(button.dataset['aparteSplitPane'] === 'end' ? 'end' : 'start'));

function showPane(which: 'start' | 'end'): void {
    split.showPane(which);
    markPane(which);
}

function openReport(report: Report): void {
    pane.show(report);
    showPane('end');
}

/** A thread was picked, or a new one started: on a phone, close the drawer and show the chat. */
function leaveDrawer(): void {
    if (sidebar.drawer) sidebar.close();
    showPane('start');
}

// ─── The tools of a research run ─────────────────────────────────────────────

// create_artifact, its grammar and its card. The plugin's card has no "open beside the chat",
// so registerResearchRenderers replaces it with a receipt that opens the report in the pane,
// and the tool is registered again with a handler that also puts each new report there.
setupArtifacts();
aparteGlobalConfig.registerTool(createArtifactTool(), async (call) => {
    const result = await artifactHandler(call);
    pane.show(result.structuredContent as Report);
    return result;
});
aparteGlobalConfig.registerTool(webSearchTool, webSearch);
aparteGlobalConfig.registerTool(readPageTool, readPage);
registerResearchRenderers(openReport);

// ─── The model and the client ────────────────────────────────────────────────

const model = createScenarioProvider({
    id: 'research',
    name: 'Research',
    scenarios: SCENARIOS,
    pacing: replyPacing(),
    // `function_calling` is what gets a model's tool calls through the loop.
    models: [{ id: 'research-large', name: 'Research', contextWindow: 128000, capabilities: ['streaming', 'function_calling'] }],
});
aparteGlobalConfig.registerAIProvider(model);
aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'research-large' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();

// ─── The threads ─────────────────────────────────────────────────────────────

/** A store in memory, over the seeded threads. A real app reads and writes its own here. */
function memoryAdapter(threads: AparteConversation[]): AparteStorageAdapter {
    const rows = new Map(threads.map((thread) => [thread.id, thread]));
    return {
        loadAll: async () => [...rows.values()],
        save: async (thread) => { rows.set(thread.id, thread); },
        delete: async (threadId) => { rows.delete(threadId); },
    };
}

// The showcase plays the bike-share run, so it starts without the thread that run would make.
const manager = new AparteConversationManager(memoryAdapter(mode === 'play' ? THREADS.filter((t) => t.id !== WHEELS_ID) : THREADS), {
    // A thread is titled from its first question. This one is scripted, like the model; a real
    // app calls a model here, which is what @aparte/plugin-titler does.
    titleProvider: (question) => (question === PLAY_QUESTION ? 'Merrow Wheels, year one' : question === WEIGH_QUESTION ? 'How sources are weighed' : question),
});
aparteGlobalConfig.setConversationManager(manager);

// The controller binds the chat to the manager: it hears the list's select and the composer's
// send, creates a thread on the first message and saves it after every turn.
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

manager.subscribe(() => {
    list.conversations = manager.conversations.map(({ id, title: name, updatedAt, pinnedAt }) => ({ id, title: name, updatedAt, pinnedAt }));
    const active = manager.active;
    if (active) list.setAttribute('active-id', active.id);
    else list.removeAttribute('active-id');
    title.textContent = active?.title || 'New research';
});

/** The thread's last report, from its create_artifact call's result. */
function lastReport(messages: AparteMessage[]): Report | null {
    const calls = messages.flatMap((m) => m.segments ?? [])
        .filter((s): s is AparteToolCallSegment => s.type === 'tool_call' && s.toolCall.name === 'create_artifact' && s.status === 'resolved');
    const last = calls.at(-1);
    return last ? artifactFromToolCall(last) : null;
}

/** Put the pane and the context gauge on the thread just opened. */
function showThread(messages: AparteMessage[]): void {
    pane.show(lastReport(messages));
    // The gauge reads a turn's usage when the turn ends, and nothing on a thread that is
    // opened; this hands it the thread's last reading the way a finished turn would.
    const last = messages.filter((m) => m.role === 'assistant' && m.usage).at(-1);
    window.dispatchEvent(new CustomEvent('aparte-message-done', {
        detail: { targetId: chat.id, messageId: last?.id ?? '', role: 'assistant', usage: last?.usage ?? { inputTokens: 0, outputTokens: 0 } },
    }));
}

chat.addEventListener('aparte-conversation-loaded', () => showThread(viewport.getMessages()));
window.addEventListener('aparte-conversation-select', leaveDrawer);

part('[data-research-new]').addEventListener('click', () => {
    void controller.setConversationId(null);
    showThread([]);
    leaveDrawer();
});

wireThemeToggle(part<HTMLButtonElement>('[data-research-theme]'));

part('aparte-suggestions').setAttribute('suggestions', JSON.stringify(SUGGESTIONS));

void manager.init().then(() => {
    if (mode === 'play') {
        showThread([]);
        whenShown(() => void typeAndSend(composer, PLAY_QUESTION));
    } else {
        // The app and the tile open on the finished study, report beside it.
        void controller.setConversationId(WHEELS_ID);
    }
});

/** Light or dark for this page, on the two attributes the site and core's tokens read. */
function wireThemeToggle(button: HTMLButtonElement): void {
    const root = document.documentElement;
    const paint = (): void => {
        const dark = root.dataset['aparteTheme'] === 'dark';
        // Static SVG strings from core's extended icon set.
        button.innerHTML = dark ? sunIcon : moonIcon;
        button.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
    };
    button.addEventListener('click', () => {
        const next = root.dataset['aparteTheme'] === 'dark' ? 'light' : 'dark';
        root.dataset['theme'] = next;
        root.dataset['aparteTheme'] = next;
    });
    // The site's own changes (a framing page, another tab, the system) repaint it too.
    new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-aparte-theme'] });
    paint();
}
