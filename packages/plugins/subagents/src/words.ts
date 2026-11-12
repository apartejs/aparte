/**
 * The words a sub-agent's line says, in the chat's language.
 *
 * Core's locale is a closed list of what CORE draws, so this plugin reads its own keys off
 * `getLocale()` and defaults them here: the app's locale first, then this table for the
 * chat's language (the ten `@aparte/locales` ships), then English. The state words ("Done",
 * "Failed", "Stopped") are core's own, read with `t()`: the line says a state in the words
 * the row's badge uses.
 *
 *   aparteGlobalConfig.extendLocale({ subagentsTools: 'one:{n} outil|other:{n} outils' });
 *
 * A count is a set of plural forms, each named by its `Intl.PluralRules` category, as core's
 * `turnTools` is: Russian needs `few` and `many`, Japanese, Korean and Chinese one form.
 */
import { pluralize, type AparteConfig } from '@aparte/core';

type Language = 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';
type Word = { en: string } & Partial<Record<Language, string>>;

export const WORDS = {
    /** How many tool calls a sub-agent made, on its line: "3 tools". */
    subagentsTools: {
        en: 'one:{n} tool|other:{n} tools',
        fr: 'one:{n} outil|other:{n} outils',
        de: 'one:{n} Tool|other:{n} Tools',
        es: 'one:{n} herramienta|other:{n} herramientas',
        it: 'one:{n} strumento|other:{n} strumenti',
        ja: 'other:{n} 個のツール',
        ko: 'other:도구 {n}개',
        pt: 'one:{n} ferramenta|other:{n} ferramentas',
        ru: 'one:{n} инструмент|few:{n} инструмента|many:{n} инструментов|other:{n} инструмента',
        zh: 'other:{n} 个工具',
    },
    /** The name of a sub-agent that was given none, when no call names its line either. */
    subagentsUnnamed: {
        en: 'Sub-agent', fr: 'Sous-agent', de: 'Subagent', es: 'Subagente', it: 'Sottoagente',
        ja: 'サブエージェント', ko: '하위 에이전트', pt: 'Subagente', ru: 'Субагент', zh: '子智能体',
    },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

/** The language part of the locale's tag: `pt-BR` → `pt`, `zh-CN` → `zh`, none → `en`. */
function languageOf(config: AparteConfig): string {
    const tag = config.getLocale().tag;
    return typeof tag === 'string' && tag ? tag.split('-')[0]!.toLowerCase() : 'en';
}

/** The word for `key`: the app's locale, else this table in the chat's language, else English. */
export function word(config: AparteConfig, key: WordKey): string {
    const fromApp = (config.getLocale() as Record<string, unknown>)[key];
    const table: Word = WORDS[key];
    return (typeof fromApp === 'string' && fromApp) || table[languageOf(config) as Language] || table.en;
}

/** "3 tools", in the chat's language and its plural rules. */
export function toolCount(config: AparteConfig, n: number): string {
    const tag = config.getLocale().tag;
    return pluralize(word(config, 'subagentsTools'), n, typeof tag === 'string' && tag ? tag : undefined);
}
