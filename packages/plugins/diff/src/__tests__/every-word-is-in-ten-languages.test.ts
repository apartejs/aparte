/**
 * Every word the diff says is in the ten languages `@aparte/locales` ships.
 *
 * A key missing a language falls back to English in that chat, which is a sentence in the
 * wrong language beside every other word of the view. A word with a slot (`{n}`, `{start}`)
 * keeps it in every language, or the line number is lost there; a count keeps its plural
 * forms, the ones its language needs.
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
        const plural = (text: string) => /^(one|other):/.test(text);
        for (const language of LANGUAGES) {
            expect(table[language], `${key} in ${language}`).toBeTruthy();
            expect(slots(table[language]!), `${key}'s slots in ${language}`).toEqual(slots(table.en!));
            expect(plural(table[language]!), `${key} counts in ${language}`).toBe(plural(table.en!));
            // Every plural form of a count carries the count.
            if (plural(table.en!)) for (const form of table[language]!.split('|')) expect(form, `${key} in ${language}`).toContain('{n}');
        }
    });

    it("says a word in the chat's language, the app's own first", () => {
        aparteGlobalConfig.extendLocale({ tag: 'de' });
        expect(word(aparteGlobalConfig, 'diffCommentSubmit')).toBe('Kommentieren');
        aparteGlobalConfig.extendLocale({ diffCommentSubmit: 'Senden' } as never);
        expect(word(aparteGlobalConfig, 'diffCommentSubmit')).toBe('Senden');
    });

    it('fills the slots, and picks the plural form the language needs', () => {
        expect(word(aparteGlobalConfig, 'diffLines', { start: 3, end: 5 })).toBe('Lines 3–5');
        expect(word(aparteGlobalConfig, 'diffAdded', { n: 1 })).toBe('1 line added');
        expect(word(aparteGlobalConfig, 'diffAdded', { n: 4 })).toBe('4 lines added');
        aparteGlobalConfig.extendLocale({ tag: 'ru' });
        expect(word(aparteGlobalConfig, 'diffShowUnchanged', { n: 3 })).toBe('Показать 3 неизменённые строки');
        expect(word(aparteGlobalConfig, 'diffShowUnchanged', { n: 11 })).toBe('Показать 11 неизменённых строк');
        aparteGlobalConfig.extendLocale({ tag: 'pt-BR' });
        expect(word(aparteGlobalConfig, 'diffLine', { n: 7 })).toBe('Linha 7');
    });
});
