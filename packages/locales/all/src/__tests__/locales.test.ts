/**
 * Nine languages, each held to what a translation of the chat has to be: every string core
 * draws, none left empty or in English by accident, the same placeholders in the same keys,
 * a tag `Intl` accepts, and a left-to-right direction. Placeholders are the alignment check
 * too: a string slipped onto the next key would carry `{tool}` or `{n}` where English has none.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { APARTE_DEFAULT_LOCALE, aparteGlobalConfig, type AparteLocale } from '@aparte/core';
import * as barrel from '../index.js';
import fr from '../fr.js';
import es from '../es.js';
import ptBR from '../pt-BR.js';
import de from '../de.js';
import itLocale from '../it.js';
import ru from '../ru.js';
import ja from '../ja.js';
import ko from '../ko.js';
import zhCN from '../zh-CN.js';

type Row = { tag: string; language: string; locale: AparteLocale; exportName: keyof typeof barrel };

const LOCALES: Row[] = [
    { tag: 'fr', language: 'fr', locale: fr, exportName: 'fr' },
    { tag: 'es', language: 'es', locale: es, exportName: 'es' },
    { tag: 'pt-BR', language: 'pt', locale: ptBR, exportName: 'ptBR' },
    { tag: 'de', language: 'de', locale: de, exportName: 'de' },
    { tag: 'it', language: 'it', locale: itLocale, exportName: 'it' },
    { tag: 'ru', language: 'ru', locale: ru, exportName: 'ru' },
    { tag: 'ja', language: 'ja', locale: ja, exportName: 'ja' },
    { tag: 'ko', language: 'ko', locale: ko, exportName: 'ko' },
    { tag: 'zh-CN', language: 'zh', locale: zhCN, exportName: 'zhCN' },
];

const english = APARTE_DEFAULT_LOCALE as Record<string, string | undefined>;
const KEYS = Object.keys(english).filter((k) => typeof english[k] === 'string');
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/**
 * The few strings that are the same word in a language and in English — a technical term or a
 * loanword, not a missed translation. Anything else equal to the English default fails.
 */
const SAME_AS_ENGLISH: Record<string, string[]> = {
    fr: ['contextMessages', 'contextTotal', 'approvalArgsLabel', 'code', 'roleNameAssistant', 'conversationList', 'sidebarLabel'],
    es: ['elicitationNo', 'contextTotal', 'error'],
    'pt-BR': ['contextTotal'],
    de: ['contextTools', 'code', 'messageInfo'],
    it: ['elicitationNo', 'toolInput', 'toolOutput', 'file'],
    ru: [],
    ja: [],
    ko: [],
    'zh-CN': [],
};

afterEach(() => aparteGlobalConfig.resetLocale());

describe.each(LOCALES)('$tag', ({ tag, language, locale, exportName }) => {
    const open = locale as Record<string, string | undefined>;

    it('translates every string core draws, and none is empty', () => {
        expect(KEYS.length).toBeGreaterThan(100);
        expect(KEYS.filter((k) => typeof open[k] !== 'string')).toEqual([]);
        expect(KEYS.filter((k) => !open[k]!.trim())).toEqual([]);
    });

    it('has no key core does not declare', () => {
        const known = new Set([...KEYS, 'tag', 'direction']);
        expect(Object.keys(locale).filter((k) => !known.has(k))).toEqual([]);
    });

    it('keeps the placeholders of every English string, in the same key', () => {
        const wrong = KEYS.filter((k) => placeholders(open[k]!).join() !== placeholders(english[k]!).join());
        expect(wrong).toEqual([]);
    });

    it('leaves nothing in English but the words the language shares with it', () => {
        const same = KEYS.filter((k) => open[k] === english[k]);
        expect(same).toEqual(SAME_AS_ENGLISH[tag]);
    });

    it('names its language with a tag Intl accepts, and reads left to right', () => {
        expect(Intl.getCanonicalLocales(locale.tag!)).toEqual([locale.tag]);
        expect(new Intl.Locale(locale.tag!).language).toBe(language);
        expect(locale.direction).toBe('ltr');
        // The tag is what dates and numbers are formatted in: Intl has the language.
        expect(Intl.DateTimeFormat.supportedLocalesOf([locale.tag!])).toEqual([locale.tag]);
    });

    it('names the Preview tab the way the tab itself reads', () => {
        expect(locale.previewPending).toContain(locale.preview);
    });

    it('is the same object from the package root and from its own entry', () => {
        expect(barrel[exportName]).toBe(locale);
    });

    it('applies through setLocale, and resetLocale brings English back', () => {
        aparteGlobalConfig.setLocale(locale);
        expect(aparteGlobalConfig.getLocale().sendButton).toBe(locale.sendButton);
        expect(aparteGlobalConfig.getLocale().tag).toBe(locale.tag);
        aparteGlobalConfig.resetLocale();
        expect(aparteGlobalConfig.getLocale().sendButton).toBe(APARTE_DEFAULT_LOCALE.sendButton);
    });
});

describe('the package', () => {
    it('exports the nine languages from its root, and nothing else', () => {
        expect(Object.keys(barrel).sort()).toEqual(LOCALES.map((l) => l.exportName).sort());
    });
});
