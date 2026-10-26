/**
 * The Support widget's behaviour: a scripted model behind the real client, the help-center
 * search, the plan question (@aparte/plugin-ask-user), the handoff to a person, what the page
 * does when the launcher opens over it, and the three modes (src/templates/runtime.ts).
 */
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, APARTE_DEFAULT_LOCALE } from '@aparte/core';
import type { AparteLauncher, AparteMessage } from '@aparte/core';
import { setupAskUser } from '@aparte/plugin-ask-user';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { followTheme, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { AGENT, ASSISTANT_NAME } from './brand';
import { setupAvatars, setupHandoff } from './handoff';
import { setupHelpCenter } from './help-center';
import { match, PLAY_QUESTION, SCENARIOS, SEED, welcome } from './scenario';

followTheme();

// Markdown before anything renders: a bubble drawn first would show its raw text, then be drawn again.
setupMarkedProvider();
setupStreamingMarkdownProvider();
// The transcript names the assistant's messages after it.
aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, tag: 'en', roleNameAssistant: ASSISTANT_NAME });
// A help chat is read, not quoted: no copy button under every reply.
aparteGlobalConfig.setBubbleActions({ copy: false });
// A plan is one of three: no free-text "Other…" under the choices.
aparteGlobalConfig.setElicitationOptions({ allowOther: false });
setupAskUser();
setupHelpCenter();
setupAvatars();

const model = createScenarioProvider({
    id: 'kilnhouse',
    name: ASSISTANT_NAME,
    scenarios: SCENARIOS,
    match,
    pacing: replyPacing(),
    models: [{ id: 'wren', name: ASSISTANT_NAME, capabilities: ['streaming', 'function_calling'] }],
});
aparteGlobalConfig.registerAIProvider(model);
aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'wren' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();

type Viewport = HTMLElement & { setMessages(messages: AparteMessage[]): void; appendMessage(message: AparteMessage): void };
type Chat = HTMLElement & { viewport: Viewport | null };
type Composer = HTMLElement & { setValue(value: string): void; submit(): void };

const launcher = document.querySelector<AparteLauncher>('aparte-launcher.sw-widget')!;
const panel = launcher.querySelector<HTMLElement>('.sw-panel')!;
const chat = panel.querySelector<Chat>('aparte-chat')!;
const composer = panel.querySelector<Composer>('aparte-composer')!;
const input = panel.querySelector<HTMLElement & { focusEnd(): void }>('aparte-composer-input')!;
const suggestions = panel.querySelector<HTMLElement>('aparte-suggestions')!;
const site = document.querySelector<HTMLElement>('.sw-site')!;
const status = panel.querySelector<HTMLElement & { show(): void; hide(): void }>('aparte-chat-status')!;

// ── The launcher ─────────────────────────────────────────────────────────────────────────────
// The launcher opens, closes and moves the focus; the ✕ in the card's header closes it through
// `data-aparte-launcher-close`. The panel starts open, so a visitor sees it (on a phone it
// would cover the whole site, so there it starts closed); nothing takes the focus until they act.

/**
 * An open sheet covers the site: take it out of the tab order and the accessibility tree
 * meanwhile. The toggle fires again when the window crosses the breakpoint while it is open.
 */
function syncSite(): void {
    site.inert = launcher.open && launcher.sheet;
}
launcher.addEventListener('aparte-launcher-toggle', syncSite);

// Escape from inside the launcher is the launcher's. From nowhere in particular (the page's
// body, after a click on the site), the open chat is still the one thing over the page.
document.addEventListener('keydown', (event) => {
    const from = document.activeElement;
    if (event.key === 'Escape' && !event.defaultPrevented && launcher.open && (!from || from === document.body)) launcher.close();
});

// The topics belong to the welcome: they go once the visitor has asked something. The element
// never lifts a `hidden` it did not set, and a pressed topic hands the focus on to the input
// rather than leaving it on a button that is gone.
chat.addEventListener('aparte-send', () => {
    const pressed = suggestions.contains(document.activeElement);
    suggestions.hidden = true;
    if (pressed) input.focusEnd();
});

// ── The person behind the assistant ─────────────────────────────────────────────────────────
setupHandoff(chat, status, () => {
    panel.querySelector<HTMLElement>('.sw-panel__agent')!.hidden = false;
    panel.querySelector('.sw-panel__title')!.textContent = `${AGENT.firstName} and ${ASSISTANT_NAME}`;
    panel.querySelector('.sw-panel__status-text')!.textContent = `${AGENT.firstName} from ${AGENT.team} is here.`;
});

// ── The modes ────────────────────────────────────────────────────────────────────────────────
const mode = templateMode();

if (mode === 'thumb') {
    // The tile shows a finished conversation at once: the articles and the answered question.
    suggestions.hidden = true;
    chat.viewport?.setMessages(SEED);
} else {
    chat.viewport?.appendMessage(welcome());
    // On a phone the open panel is a sheet over the whole site: start with the button instead.
    if (mode === 'full' && launcher.sheet) launcher.close();
}
syncSite();

if (mode === 'play') {
    whenShown(() => void play());
}

/**
 * The showcase: a question typed and sent, the help-center search, the cards, then the plan
 * question, answered the way a visitor would, by pressing a choice, a moment after it appears.
 */
async function play(): Promise<void> {
    await typeAndSend(composer, PLAY_QUESTION);
    const choice = await waitFor(() =>
        [...composer.querySelectorAll<HTMLElement>('.aparte-elic-option')].find(
            (option) => option.querySelector('.aparte-elic-option-title')?.textContent === 'Studio',
        ),
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
    choice?.click();
}

/** Poll for something the turn will draw, with a ceiling. */
async function waitFor<T>(find: () => T | undefined, ceilingMs = 15000): Promise<T | undefined> {
    const start = Date.now();
    while (Date.now() - start < ceilingMs) {
        const found = find();
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return undefined;
}
