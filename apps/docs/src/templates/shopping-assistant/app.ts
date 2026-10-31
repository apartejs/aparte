/**
 * The Shopping assistant's behaviour: a scripted model behind the real client, the shop's tools
 * and their cards (tools.ts), the reason question (@aparte/plugin-ask-user), the cart the cards'
 * buttons fill, the shop's search box that asks the assistant, and the three modes
 * (src/templates/runtime.ts). The markup is Template.astro.
 */
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, APARTE_DEFAULT_LOCALE } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';
import { setupAskUser } from '@aparte/plugin-ask-user';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { followTheme, reducedMotion, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { ASSISTANT_NAME, CUSTOMER, MARK_SVG } from './brand';
import { createCart } from './cart';
import { match, PLAY_QUESTION, SCENARIOS, seed, SUGGESTIONS, welcome } from './scenario';
import { ADD_TO_CART, EMAIL_LABEL, setupShopTools } from './tools';

followTheme();

// Markdown before anything renders: a bubble drawn first would show its raw text, then be drawn again.
setupMarkedProvider();
setupStreamingMarkdownProvider();
aparteGlobalConfig.setLocale({
    ...APARTE_DEFAULT_LOCALE,
    tag: 'en',
    // The transcript names the assistant's messages after it.
    roleNameAssistant: ASSISTANT_NAME,
    // The one call that asks first is the return, and its display reads as a question already:
    // "Start a return for the Ash Serving Board?" (tools.ts), with the answers in its words.
    approvalAsk: '{tool}?',
    approveTool: 'Start the return',
    rejectTool: 'Not now',
});
// A reason is one of three: no free-text "Other…" under the choices.
aparteGlobalConfig.setElicitationOptions({ allowOther: false });
setupAskUser();
setupShopTools();

// The Pinecrate mark beside the assistant's messages; none beside the customer's.
aparteGlobalConfig.setAvatarProvider({
    render(role, host) {
        if (role === 'user') return;
        const face = document.createElement('span');
        face.className = 'sa-face';
        face.innerHTML = MARK_SVG; // a constant of brand.ts, not data
        host.append(face);
    },
});

const model = createScenarioProvider({
    id: 'pinecrate',
    name: ASSISTANT_NAME,
    scenarios: SCENARIOS,
    match,
    pacing: replyPacing(),
    models: [{ id: 'pip', name: ASSISTANT_NAME, capabilities: ['streaming', 'function_calling'] }],
});
aparteGlobalConfig.registerAIProvider(model);
aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'pip' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();

type Viewport = HTMLElement & { setMessages(messages: AparteMessage[]): void; appendMessage(message: AparteMessage): void };
type Chat = HTMLElement & { viewport: Viewport | null };
type Composer = HTMLElement & { setValue(value: string): void; submit(): void; streaming: boolean };

const root = document.querySelector<HTMLElement>('.shopping-assistant')!;
const launcher = root.querySelector<HTMLElement & { open: boolean }>('aparte-launcher')!;
const chat = root.querySelector<Chat>('aparte-chat')!;
const composer = chat.querySelector<Composer>('aparte-composer')!;
const input = chat.querySelector<HTMLElement & { focusEnd(): void }>('aparte-composer-input')!;
const suggestions = chat.querySelector<HTMLElement & { suggestions: typeof SUGGESTIONS }>('aparte-suggestions')!;
suggestions.suggestions = SUGGESTIONS;

// ── The cart ─────────────────────────────────────────────────────────────────────────────────
// Alex already has a dripper in it. The buttons the cards draw report their `id` in
// `aparte-card-action`, with the product the button sits on as `data`; the storefront's tiles
// carry the same id in their markup.
const cart = createCart(root, { 'cone-dripper': 1 });

document.addEventListener('aparte-card-action', (event) => {
    const { action, data } = event.detail;
    if (action.id === ADD_TO_CART) cart.add(String((data as { id?: unknown }).id ?? ''));
    else if (action.id === EMAIL_LABEL) cart.toast(`Return label sent to ${CUSTOMER.email}`);
});
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sa-add]')) {
    button.addEventListener('click', () => cart.add(button.dataset['saAdd'] ?? ''));
}

// ── The shop around the assistant ───────────────────────────────────────────────────────────
/** The assistant may have been closed to its button: open it again before it answers. */
const showAssistant = (): void => { launcher.open = true; };

// The shop's search box asks the assistant: a search that understands "a gift for my dad".
root.querySelector<HTMLFormElement>('.sa-search')!.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = (event.currentTarget as HTMLFormElement).elements.namedItem('q') as HTMLInputElement;
    const question = field.value.trim();
    // While a reply streams, `submit()` would stop it; while a question holds the composer, it
    // would answer it. Neither is what a search means.
    if (!question || composer.streaming || chat.querySelector('.aparte-elic-option')) return;
    showAssistant();
    composer.setValue(question);
    composer.submit();
    field.value = '';
});
root.querySelector('[data-sa-ask]')!.addEventListener('click', () => {
    showAssistant();
    input.focusEnd();
});

// The starters belong to the welcome: they go once the customer has asked something. A pressed
// starter hands the focus on to the input rather than leaving it on a button that is gone.
chat.addEventListener('aparte-send', () => {
    const pressed = suggestions.contains(document.activeElement);
    suggestions.hidden = true;
    if (pressed) input.focusEnd();
});

// ── The modes ────────────────────────────────────────────────────────────────────────────────
const mode = templateMode();

if (mode === 'thumb') {
    // The tile shows a finished conversation at once: the kettles as cards, and the advice.
    suggestions.hidden = true;
    chat.viewport?.setMessages(seed());
} else {
    chat.viewport?.appendMessage(welcome());
}

if (mode === 'play') whenShown(() => void play());

/**
 * The showcase: a question typed and sent, the search's cards, then "Add to cart" pressed on the
 * first of them a moment later, the way a customer would, so the cart in the header counts it.
 */
async function play(): Promise<void> {
    await typeAndSend(composer, PLAY_QUESTION);
    const add = await waitFor(() => chat.querySelector<HTMLButtonElement>('.aparte-product__action'));
    await new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : 2200));
    add?.click();
}

/** Poll for something the turn will draw, with a ceiling. */
async function waitFor<T>(find: () => T | null, ceilingMs = 15000): Promise<T | null> {
    const start = Date.now();
    while (Date.now() - start < ceilingMs) {
        const found = find();
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return null;
}
