/**
 * The words a chart draws, in the chat's language.
 *
 * Core's locale is a closed list of what CORE draws, so this plugin reads its own keys off
 * `getLocale()` and defaults them here: the app's locale first, then this table for the
 * chat's language (the ten `@aparte/locales` ships), then English.
 *
 *   aparteGlobalConfig.extendLocale({ chartjsChart: 'Graphique' });
 */
import type { AparteConfig } from '@aparte/core';

type Language = 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';
type Word = { en: string } & Partial<Record<Language, string>>;

export const WORDS = {
    /** A chart's accessible name when its config gives it no title. */
    chartjsChart: {
        en: 'Chart', fr: 'Graphique', de: 'Diagramm', es: 'Gráfico', it: 'Grafico',
        ja: 'グラフ', ko: '차트', pt: 'Gráfico', ru: 'Диаграмма', zh: '图表',
    },
    /** The note over the source of a chart that could not be drawn. */
    chartjsError: {
        en: 'This chart could not be drawn.', fr: 'Ce graphique n’a pas pu être tracé.',
        de: 'Dieses Diagramm konnte nicht gezeichnet werden.', es: 'No se pudo dibujar este gráfico.',
        it: 'Impossibile disegnare questo grafico.', ja: 'このグラフは描画できませんでした。',
        ko: '이 차트를 그릴 수 없습니다.', pt: 'Não foi possível desenhar este gráfico.',
        ru: 'Не удалось построить эту диаграмму.', zh: '无法绘制此图表。',
    },
    /** A tool that should have returned a chart and did not run, or failed. */
    chartjsUnavailable: {
        en: 'Chart not available', fr: 'Graphique indisponible', de: 'Diagramm nicht verfügbar',
        es: 'Gráfico no disponible', it: 'Grafico non disponibile', ja: 'グラフは利用できません',
        ko: '차트를 사용할 수 없음', pt: 'Gráfico indisponível', ru: 'Диаграмма недоступна', zh: '图表不可用',
    },
    /** A column of the data table for a dataset with no label. */
    chartjsSeries: {
        en: 'Series {n}', fr: 'Série {n}', de: 'Reihe {n}', es: 'Serie {n}', it: 'Serie {n}',
        ja: '系列 {n}', ko: '계열 {n}', pt: 'Série {n}', ru: 'Ряд {n}', zh: '系列 {n}',
    },
    /** The data table's last line, when it lists only part of the data. */
    chartjsTableCut: {
        en: 'Only part of the data is listed.', fr: 'Seule une partie des données est listée.',
        de: 'Nur ein Teil der Daten ist aufgeführt.', es: 'Solo se muestra una parte de los datos.',
        it: 'È elencata solo una parte dei dati.', ja: 'データの一部のみを表示しています。',
        ko: '데이터의 일부만 표시됩니다.', pt: 'Apenas parte dos dados está listada.',
        ru: 'Показана только часть данных.', zh: '仅列出部分数据。',
    },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

/** The language part of the locale's tag: `pt-BR` → `pt`, none → `en`. */
function languageOf(config: AparteConfig): string {
    const tag = config.getLocale().tag;
    return typeof tag === 'string' && tag ? tag.split('-')[0]!.toLowerCase() : 'en';
}

/** The word for `key`, with `{name}` placeholders filled from `vars`. */
export function word(config: AparteConfig, key: WordKey, vars: Record<string, string> = {}): string {
    const fromApp = (config.getLocale() as Record<string, unknown>)[key];
    const table: Word = WORDS[key];
    const text = (typeof fromApp === 'string' && fromApp) || table[languageOf(config) as Language] || table.en;
    return text.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all);
}
