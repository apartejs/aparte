/**
 * The words of the widget's own chrome — its header, its welcome screen, its input — by
 * language, under the names n8n's widget gives them. The chat's own words (the send
 * button, the error card, the copy action) come from aparté's locale for the same language.
 */
import { APARTE_DEFAULT_LOCALE } from '@aparte/core';
import type { AparteLocale } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

export interface ChatStrings {
    /** The header's title. */
    title: string;
    /** The line under it; an empty string leaves it out. */
    subtitle: string;
    /** A line under the chat; an empty string leaves it out. */
    footer: string;
    /** The welcome screen's button, with `showWelcomeScreen`. */
    getStarted: string;
    /** The input's placeholder. */
    inputPlaceholder: string;
    /** The name of the header's close button. */
    closeButtonTooltip: string;
    /**
     * What the person reads when n8n cannot be reached. What to change in n8n goes to the
     * browser's console, for the page's developer.
     */
    errorUnreachable: string;
    /** What the person reads when the answer took too long. */
    errorTimeout: string;
    /** What the person reads when the workflow failed. */
    errorFailed: string;
}

/** n8n's widget's own English, word for word, so a page that switches looks the same. */
const EN: ChatStrings = {
    title: 'Hi there! 👋',
    subtitle: "Start a chat. We're here to help you 24/7.",
    footer: '',
    getStarted: 'New Conversation',
    inputPlaceholder: 'Type your question..',
    closeButtonTooltip: 'Close chat',
    errorUnreachable: 'The assistant can’t be reached right now. Try again in a moment.',
    errorTimeout: 'The answer took too long. Try again in a moment.',
    errorFailed: 'The assistant couldn’t answer. Try again in a moment.',
};

const FR: ChatStrings = {
    title: 'Bonjour ! 👋',
    subtitle: 'Démarrez une conversation. Nous sommes là pour vous aider, 24 h/24.',
    footer: '',
    getStarted: 'Nouvelle conversation',
    inputPlaceholder: 'Posez votre question…',
    closeButtonTooltip: 'Fermer le chat',
    errorUnreachable: 'L’assistant est injoignable pour le moment. Réessayez dans un instant.',
    errorTimeout: 'La réponse a pris trop de temps. Réessayez dans un instant.',
    errorFailed: 'L’assistant n’a pas pu répondre. Réessayez dans un instant.',
};

export const BUILT_IN_STRINGS: Record<string, ChatStrings> = { en: EN, fr: FR };

/** The first messages n8n's widget shows, in its words, and their French. */
export const BUILT_IN_INITIAL_MESSAGES: Record<string, string[]> = {
    en: ['Hi there! 👋', 'My name is Nathan. How can I assist you today?'],
    fr: ['Bonjour ! 👋', 'Je m’appelle Nathan. Comment puis-je vous aider ?'],
};

/** aparté's own locale for a language: the two it ships, else English. */
export function localeFor(language: string): AparteLocale {
    return language.split('-')[0] === 'fr' ? fr : APARTE_DEFAULT_LOCALE;
}

/** The chrome's words for a language: the built-in ones under the page's own. */
export function stringsFor(language: string, i18n: Record<string, Partial<ChatStrings>> | undefined): ChatStrings {
    const base = BUILT_IN_STRINGS[language] ?? BUILT_IN_STRINGS[language.split('-')[0] ?? ''] ?? EN;
    return { ...base, ...(i18n?.[language] ?? {}) };
}
