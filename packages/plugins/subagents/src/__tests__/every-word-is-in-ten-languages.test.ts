/**
 * Every word the plugin says is in the ten languages `@aparte/locales` ships.
 *
 * A key missing a language falls back to English in that chat, which is a sentence in the
 * wrong language under every other word of the line. A word with a slot (`{n}`, `{name}`)
 * keeps it in every language, or the count or the name is lost there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { WORDS, word, type WordKey } from '../words.js';

const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'ja', 'ko', 'pt', 'ru', 'zh'] as const;

afterEach(() => aparteGlobalConfig.reset());

describe('the word table', () => {
    it.each(Object.keys(WORDS) as WordKey[])('has %s in every language, with its slots', (key) => {
        const table = WORDS[key] as Record<string, string>;
        const slots = (text: string): string[] => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
        for (const language of LANGUAGES) {
            expect(table[language], `${key} in ${language}`).toBeTruthy();
            expect(slots(table[language]!), `${key}'s slots in ${language}`).toEqual(slots(table.en!));
        }
    });

    it("says the Open and Close words in the chat's language, the app's own first", () => {
        aparteGlobalConfig.extendLocale({ tag: 'de' });
        expect(word(aparteGlobalConfig, 'subagentsOpen')).toBe('{name} öffnen');
        expect(word(aparteGlobalConfig, 'subagentsClose')).toBe('Schließen');
        aparteGlobalConfig.extendLocale({ subagentsClose: 'Zu' } as never);
        expect(word(aparteGlobalConfig, 'subagentsClose')).toBe('Zu');
    });
});
