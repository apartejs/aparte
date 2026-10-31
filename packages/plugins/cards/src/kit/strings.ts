/**
 * A card's words, in the chat's language.
 *
 * Core's locale is a closed list of what CORE draws, so a plugin reads its own keys off
 * `getLocale()` and defaults them at the call site (the localization guide). A card does
 * that, with one step in between: this package carries its words in the ten languages
 * `@aparte/locales` ships, picked by the locale's `tag`. An app that sets a key wins;
 * a language the table does not have reads English.
 *
 *   aparteGlobalConfig.extendLocale({ cardsWeatherWind: 'Vent' });
 */
import type { AparteConfig } from '@aparte/core';

/** The languages a card's words come in, beside English. */
export type CardLanguage = 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';

/** One word or phrase, in English and in as many of the other languages as it has. */
export type CardWord = { en: string } & Partial<Record<CardLanguage, string>>;

/** The language part of the locale's tag: `pt-BR` → `pt`, `zh-CN` → `zh`, none → `en`. */
export function languageOf(config: AparteConfig): string {
    const tag = config.getLocale().tag;
    return (typeof tag === 'string' && tag ? tag.split('-')[0]!.toLowerCase() : 'en');
}

/** The locale's tag for `Intl`, or `undefined` to follow the browser (never `''`, which throws). */
export function intlTag(config: AparteConfig): string | undefined {
    const tag = config.getLocale().tag;
    if (typeof tag !== 'string' || !tag) return undefined;
    // A tag `Intl` refuses (`en_US`, a typo) would make every number and date on the card
    // throw, so the card would not draw at all: the underscore form is mended, anything else
    // follows the browser.
    for (const candidate of [tag, tag.replace(/_/g, '-')]) {
        try {
            return Intl.getCanonicalLocales(candidate)[0];
        } catch {
            // the next candidate
        }
    }
    return undefined;
}

/**
 * The word for `key`: the app's locale first, then this package's table for the chat's
 * language, then English. `{name}` placeholders are filled from `vars`.
 */
export function word(config: AparteConfig, key: string, table: CardWord, vars: Record<string, string> = {}): string {
    const fromApp = config.getLocale()[key];
    const lang = languageOf(config) as CardLanguage;
    const text = (typeof fromApp === 'string' && fromApp) || table[lang] || table.en;
    return text.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all);
}

/** The words every card shares. */
export const KIT_WORDS = {
    cardsUnavailable: {
        en: 'Not available', fr: 'Indisponible', de: 'Nicht verfügbar', es: 'No disponible', it: 'Non disponibile',
        ja: '利用できません', ko: '사용할 수 없음', pt: 'Indisponível', ru: 'Недоступно', zh: '不可用',
    },
    cardsWaiting: {
        en: 'Waiting for your approval', fr: 'En attente de votre accord', de: 'Wartet auf Ihre Zustimmung',
        es: 'Esperando tu aprobación', it: 'In attesa della tua approvazione', ja: '承認を待っています',
        ko: '승인을 기다리는 중', pt: 'Aguardando sua aprovação', ru: 'Ожидает вашего подтверждения', zh: '等待您的批准',
    },
    cardsRefused: {
        en: 'Not run', fr: 'Non exécuté', de: 'Nicht ausgeführt', es: 'No ejecutado', it: 'Non eseguito',
        ja: '実行されませんでした', ko: '실행되지 않음', pt: 'Não executado', ru: 'Не выполнено', zh: '未执行',
    },
    cardsLoading: {
        en: 'Loading', fr: 'Chargement', de: 'Wird geladen', es: 'Cargando', it: 'Caricamento',
        ja: '読み込み中', ko: '불러오는 중', pt: 'Carregando', ru: 'Загрузка', zh: '加载中',
    },
    cardsPrevious: {
        en: 'Previous', fr: 'Précédent', de: 'Zurück', es: 'Anterior', it: 'Precedente',
        ja: '前へ', ko: '이전', pt: 'Anterior', ru: 'Назад', zh: '上一个',
    },
    cardsNext: {
        en: 'Next', fr: 'Suivant', de: 'Weiter', es: 'Siguiente', it: 'Successivo',
        ja: '次へ', ko: '다음', pt: 'Próximo', ru: 'Далее', zh: '下一个',
    },
    cardsSlide: {
        en: '{n} of {total}', fr: '{n} sur {total}', de: '{n} von {total}', es: '{n} de {total}', it: '{n} di {total}',
        ja: '{total}件中{n}件目', ko: '{total}개 중 {n}번째', pt: '{n} de {total}', ru: '{n} из {total}', zh: '第 {n} 个，共 {total} 个',
    },
    cardsRating: {
        en: 'Rated {value} out of {max}', fr: 'Noté {value} sur {max}', de: 'Bewertet mit {value} von {max}',
        es: 'Valoración: {value} de {max}', it: 'Valutato {value} su {max}', ja: '{max}点中{value}点',
        ko: '{max}점 만점에 {value}점', pt: 'Avaliado em {value} de {max}', ru: 'Оценка {value} из {max}', zh: '评分 {value}/{max}',
    },
    cardsReviews: {
        en: '{count} reviews', fr: '{count} avis', de: '{count} Bewertungen', es: '{count} reseñas', it: '{count} recensioni',
        ja: 'レビュー{count}件', ko: '리뷰 {count}개', pt: '{count} avaliações', ru: 'Отзывов: {count}', zh: '{count} 条评价',
    },
} satisfies Record<string, CardWord>;
