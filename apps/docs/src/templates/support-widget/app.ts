/**
 * The Support widget's behaviour: a scripted model behind the real client, the help-center
 * search, the plan question (@aparte/plugin-ask-user), the handoff to a person, the launcher
 * that opens and closes the panel, and the three modes (src/templates/runtime.ts).
 */
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, APARTE_DEFAULT_LOCALE } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';
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

const widget = document.querySelector<HTMLElement>('.sw-widget')!;
const panel = widget.querySelector<HTMLElement>('.sw-panel')!;
const launcher = widget.querySelector<HTMLButtonElement>('.sw-launcher')!;
const chat = panel.querySelector<Chat>('aparte-chat')!;
const composer = panel.querySelector<Composer>('aparte-composer')!;
const input = panel.querySelector<HTMLElement & { focusEnd(): void }>('aparte-composer-input')!;
const suggestions = panel.querySelector<HTMLElement>('aparte-suggestions')!;
const site = document.querySelector<HTMLElement>('.sw-site')!;
const status = panel.querySelector<HTMLElement & { show(): void; hide(): void }>('aparte-chat-status')!;
// The same breakpoint as the CSS: under it the panel is a full-screen sheet.
const sheet = matchMedia('(max-width: 30rem)');

// ── The launcher and the panel ───────────────────────────────────────────────────────────────
// The panel starts open, so a visitor sees it (on a phone it would cover the whole site, so
// there it starts closed); nothing takes the focus until they act. A click that opens it moves
// the focus into it, and closing it gives the focus back to the launcher.
function setOpen(open: boolean): void {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    syncSite();
    if (open) input.focusEnd();
    else launcher.focus();
}

/** A sheet covers the site: take it out of the tab order and the accessibility tree meanwhile. */
function syncSite(): void {
    site.inert = !panel.hidden && sheet.matches;
}
sheet.addEventListener('change', syncSite);

launcher.addEventListener('click', () => setOpen(panel.hidden));
panel.querySelector('.sw-panel__close')!.addEventListener('click', () => setOpen(false));
// Escape from inside the widget, or from nowhere in particular (the page's body): the panel is
// the one thing open over the page.
document.addEventListener('keydown', (event) => {
    const from = document.activeElement;
    const ours = !from || from === document.body || widget.contains(from);
    if (event.key === 'Escape' && !event.defaultPrevented && !panel.hidden && ours) setOpen(false);
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
    // On a phone the open panel is a sheet over the whole site: start with the launcher instead.
    if (mode === 'full' && sheet.matches) {
        panel.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
    }
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
