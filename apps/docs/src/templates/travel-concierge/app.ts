/**
 * The Travel concierge's behaviour, in the order an app writes it: the renderers (Markdown, the
 * cards), the tools, the scripted model behind the real client, then what the app does around
 * the chat (the buttons under the cards, the trip panel, the starters) and the three modes
 * (src/templates/runtime.ts). The markup is Template.astro.
 */
import { APARTE_DEFAULT_LOCALE, AparteClient, AparteDirectTransport, aparteGlobalConfig } from '@aparte/core';
import type { AparteChatViewport, AparteSendEventDetail } from '@aparte/core';
import { readPlaces } from '@aparte/plugin-cards/place';
import type { PlaceData } from '@aparte/plugin-cards/place';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { followTheme, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { hasStay, markInCalendar, notify, savePlaces, showStay, showTripDates } from './board';
import { CONCIERGE, MARK_SVG } from './brand';
import { confirmStay, placesByTheRiver, STAY_OFFER } from './porto';
import { match, SCENARIOS, seed, welcome } from './scenario';
import { PLACES_QUESTION, STARTERS, STAY_QUESTION, WEATHER_QUESTION } from './starters';
import { ADD_TO_CALENDAR, registerTools, SAVE_PLACES, setupCards } from './tools';

type Composer = HTMLElement & { streaming: boolean; panelActive: boolean; setValue(value: string): void; submit(): void };
type Suggestions = HTMLElement & { suggestions: typeof STARTERS };

followTheme();
showTripDates();

// Markdown and the cards before anything renders: a bubble drawn first would show its raw text,
// or the tool's plain row, then be drawn again.
setupMarkedProvider();
setupStreamingMarkdownProvider();
setupCards();

aparteGlobalConfig.setLocale({
    ...APARTE_DEFAULT_LOCALE,
    tag: 'en',
    // The transcript names the assistant's messages after the concierge.
    roleNameAssistant: CONCIERGE,
    // The booking is the one call that asks first. The tool's display gives it a label and a
    // summary ("Book" + "Casa da Ribeira, 3 nights"), so the question is the call itself, and
    // the two answers say what they do.
    approvalAsk: '{tool}?',
    approveTool: 'Book it',
    rejectTool: 'Not now',
    approvalInstructionPlaceholder: 'Or ask for something else…',
});

// The booking's handler is where a real app would call its booking API; once it has, the trip
// panel shows the stay.
registerTools((booking) => {
    showStay(booking);
    notify(`${booking.hotel} is booked`);
});

// The concierge's face on its messages: Saltroad's mark. None on the traveller's.
aparteGlobalConfig.setAvatarProvider({
    render(role, host) {
        if (role === 'user') return;
        const face = document.createElement('span');
        face.className = 'tc-face';
        face.innerHTML = MARK_SVG; // A constant from brand.ts, not data.
        host.append(face);
    },
});

const model = createScenarioProvider({
    id: 'saltroad',
    name: CONCIERGE,
    scenarios: SCENARIOS,
    match,
    pacing: replyPacing(),
    models: [{ id: 'concierge', name: CONCIERGE, capabilities: ['streaming', 'function_calling'] }],
});
aparteGlobalConfig.registerAIProvider(model);
aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'concierge' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();

const root = document.querySelector<HTMLElement>('.travel-concierge')!;
const chat = root.querySelector<HTMLElement>('aparte-chat')!;
const viewport = chat.querySelector<AparteChatViewport>('aparte-chat-viewport')!;
const composer = chat.querySelector<Composer>('aparte-composer')!;
const suggestions = chat.querySelector<Suggestions>('aparte-suggestions')!;

// ── The buttons under the cards ──────────────────────────────────────────────────────────────
// The two the app declared in the cards' setup (tools.ts). The event bubbles out of the chat
// with the data the card was drawn from, already read into the card's fields.
document.addEventListener('aparte-card-action', (event) => {
    const { action, data } = event.detail;
    if (action.id === SAVE_PLACES) {
        const added = savePlaces((data as PlaceData).places);
        notify(added ? `${added} places saved to your trip` : 'Already in your trip');
    } else if (action.id === ADD_TO_CALENDAR) {
        markInCalendar();
        notify('Added to your calendar');
    }
});

// ── The starters ─────────────────────────────────────────────────────────────────────────────
// They stay under the conversation as follow-ups, each one gone once it has been asked.
const asked = new Set<string>();
function dropAsked(text: string): void {
    asked.add(text.trim());
    suggestions.suggestions = STARTERS.filter((starter) => !asked.has(starter.prompt));
}
chat.addEventListener('aparte-send', (event) => dropAsked(String((event as CustomEvent<AparteSendEventDetail>).detail.content ?? '')));

/**
 * Ask a question for the traveller from outside the chat (the panel's "Find a stay"), through the
 * composer like a typed one. Not while a reply streams or a question holds the composer: `submit()`
 * would stop the reply, or answer the question.
 */
function ask(question: string): void {
    if (composer.streaming || composer.panelActive) return;
    composer.setValue(question);
    composer.submit();
}
root.querySelector('[data-tc="find-stay"]')?.addEventListener('click', () => {
    if (!hasStay()) ask(STAY_QUESTION);
});

// ── The modes ────────────────────────────────────────────────────────────────────────────────
const mode = templateMode();

if (mode === 'thumb') {
    // The tile shows the trip planned at once: the conversation, the stay and the places saved.
    const messages = seed();
    viewport.setMessages(messages);
    for (const message of messages) if (message.role === 'user') dropAsked(String(message.content));
    showStay(confirmStay(STAY_OFFER));
    savePlaces(readPlaces(placesByTheRiver())?.places ?? []);
} else {
    viewport.appendMessage(welcome());
}

if (mode === 'play') whenShown(() => void play());

/** The showcase: the forecast, then places for dinner, each typed and sent like a traveller would. */
async function play(): Promise<void> {
    await typeAndSend(composer, WEATHER_QUESTION);
    await turnDone();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await typeAndSend(composer, PLACES_QUESTION);
}

/** The end of the current turn, tools and all (`aparte-message-done`), with a ceiling. */
function turnDone(ceilingMs = 20000): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ceilingMs);
        chat.addEventListener('aparte-message-done', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
