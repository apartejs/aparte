/**
 * The n8n chat widget template's behaviour: `createChat` from @aparte/n8n-chat — the call
 * n8n's own widget takes — on a replay of an n8n workflow (replay.ts), the panel that switches
 * its language and its look, and the field that points it at the visitor's own n8n.
 *
 * The look is n8n's by default; "The bakery's" sets n8n's own `--chat--*` variables on the
 * page, the way a site restyles n8n's widget, and the theme reads them.
 */
import { createChat } from '@aparte/n8n-chat';
import type { Chat, ChatOptions } from '@aparte/n8n-chat';
import '@aparte/n8n-chat/theme.css';
import { followTheme, reducedMotion, templateMode, typeAndSend, whenShown } from '../runtime';
import { replayFetch } from './replay';

followTheme();

type Language = 'en' | 'fr';
type Look = 'n8n' | 'brand' | 'dark';

const demo = document.querySelector<HTMLElement>('.n8n-demo')!;
const mode = templateMode();
// Framed on another page, the panel would crowd the widget: the frame shows the widget alone.
demo.dataset['mode'] = mode;
const DEMO_URL = 'https://n8n.example.com/webhook/le-fournil/chat';

const COPY: Record<Language, Pick<ChatOptions, 'initialMessages' | 'suggestions' | 'i18n'>> = {
    en: {
        initialMessages: ['Hi there! 👋', 'I’m Le Fournil’s assistant. Ask me what is out of the oven, our hours or our prices.'],
        suggestions: ['What do you bake?', 'Do you have gluten-free bread?', 'When are you open?', 'How much is a baguette?'],
        i18n: { en: { title: 'Le Fournil 🥖', subtitle: 'Ask us anything. We answer in seconds.', inputPlaceholder: 'Ask about our breads…' } },
    },
    fr: {
        initialMessages: ['Bonjour ! 👋', 'Je suis l’assistant du Fournil. Demandez-moi ce qui sort du four, nos horaires ou nos prix.'],
        suggestions: ['Que cuisez-vous ?', 'Avez-vous du pain sans gluten ?', 'Quels sont vos horaires ?', 'Combien coûte une baguette ?'],
        i18n: { fr: { title: 'Le Fournil 🥖', subtitle: 'Posez-nous vos questions. Réponse en quelques secondes.', inputPlaceholder: 'Une question sur nos pains ?' } },
    },
};

const SEED: Record<Language, ChatOptions['messageHistory']> = {
    en: [
        { sender: 'user', text: 'Do you have gluten-free bread?' },
        { sender: 'bot', text: 'Yes — two gluten-free loaves, baked on Fridays and Saturdays in a separate oven:\n\n- **Buckwheat & seeds** — €5.40\n- **Rice & chestnut** — €5.90' },
    ],
    fr: [
        { sender: 'user', text: 'Avez-vous du pain sans gluten ?' },
        { sender: 'bot', text: 'Oui — deux pains sans gluten, cuits le vendredi et le samedi dans un four à part :\n\n- **Sarrasin & graines** — 5,40 €\n- **Riz & châtaigne** — 5,90 €' },
    ],
};

let language: Language = 'en';
let look: Look = 'n8n';
let ownUrl: string | undefined;
let chat: Chat | undefined;

/** The widget, made again: language and n8n are given at creation, as with n8n's widget. */
function mount(): Chat {
    const wasOpen = chat ? chat.element.hasAttribute('open') : mode !== 'full' || !matchMedia('(max-width: 30rem)').matches;
    chat?.destroy();
    chat = createChat({
        webhookUrl: ownUrl ?? DEMO_URL,
        target: '#nd-chat',
        defaultLanguage: language,
        ...COPY[language],
        allowFileUploads: true,
        colorScheme: look === 'dark' ? 'dark' : 'light',
        // The replay keeps no conversation; your n8n does.
        loadPreviousSession: ownUrl !== undefined,
        ...(ownUrl ? {} : { fetch: replayFetch(() => language, { instant: mode === 'thumb' || reducedMotion() }) }),
        ...(mode === 'thumb' ? { messageHistory: SEED[language] } : {}),
    });
    if (wasOpen) chat.open();
    return chat;
}

// ── The panel ────────────────────────────────────────────────────────────────────────────
function press(selector: string, value: string): void {
    for (const button of demo.querySelectorAll<HTMLButtonElement>(selector)) {
        button.setAttribute('aria-pressed', String(button.dataset['langChoice'] === value || button.dataset['look'] === value));
    }
}

for (const button of demo.querySelectorAll<HTMLButtonElement>('[data-lang-choice]')) {
    button.addEventListener('click', () => {
        language = button.dataset['langChoice'] as Language;
        demo.dataset['lang'] = language;
        press('[data-lang-choice]', language);
        mount();
    });
}

for (const button of demo.querySelectorAll<HTMLButtonElement>('[data-look]')) {
    button.addEventListener('click', () => {
        look = button.dataset['look'] as Look;
        press('[data-look]', look);
        demo.classList.toggle('nd-brand', look === 'brand');
        chat?.element.setAttribute('data-aparte-theme', look === 'dark' ? 'dark' : 'light');
    });
}

const form = demo.querySelector<HTMLFormElement>('.nd-connect')!;
const field = form.querySelector<HTMLInputElement>('#nd-url')!;
const hint = form.querySelector<HTMLElement>('.nd-connect__hint')!;
const HINT = hint.innerHTML;
form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = field.value.trim();
    if (!value) {
        ownUrl = undefined;
        hint.innerHTML = HINT;
        mount();
        return;
    }
    let url: URL;
    try { url = new URL(value); } catch {
        hint.textContent = 'That is not a URL. Paste the Chat Trigger’s production URL, the one that ends in /chat.';
        return;
    }
    ownUrl = url.href;
    hint.textContent = url.pathname.endsWith('/chat')
        ? `Connected to ${url.host}. If nothing answers, add ${location.origin} to the trigger’s Allowed Origins.`
        : 'Connected — but a Chat Trigger’s URL ends in /chat: check it is the production URL.';
    mount().open();
});

// ── The modes ────────────────────────────────────────────────────────────────────────────
mount();

if (mode === 'play') {
    whenShown(() => {
        const composer = chat?.element.querySelector<HTMLElement & { setValue(value: string): void; submit(): void }>('aparte-composer');
        if (composer) void typeAndSend(composer, COPY[language].suggestions![1]!);
    });
}
