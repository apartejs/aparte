/**
 * The words a chart draws, in the chat's language.
 *
 * Core's locale is a closed list of what CORE draws, so a plugin reads its own keys off
 * `getLocale()` and defaults them at the call site. This package carries its few words in
 * the ten languages `@aparte/locales` ships, picked by the locale's `tag`; a key the app
 * sets wins, and a language the table does not have reads English.
 *
 *   aparteGlobalConfig.extendLocale({ echartsChart: 'Courbe' });
 */
import type { AparteConfig } from '@aparte/core';

type Language = 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';
type Word = { en: string } & Record<Language, string>;

export const WORDS = {
    echartsChart: {
        en: 'Chart', fr: 'Graphique', de: 'Diagramm', es: 'Gráfico', it: 'Grafico',
        ja: 'グラフ', ko: '차트', pt: 'Gráfico', ru: 'Диаграмма', zh: '图表',
    },
    echartsError: {
        en: 'This chart could not be drawn.', fr: 'Ce graphique n’a pas pu être dessiné.',
        de: 'Dieses Diagramm konnte nicht gezeichnet werden.', es: 'No se pudo dibujar este gráfico.',
        it: 'Impossibile disegnare questo grafico.', ja: 'このグラフを描画できませんでした。',
        ko: '이 차트를 그릴 수 없습니다.', pt: 'Não foi possível desenhar este gráfico.',
        ru: 'Не удалось построить эту диаграмму.', zh: '无法绘制此图表。',
    },
    echartsLoading: {
        en: 'Loading chart', fr: 'Chargement du graphique', de: 'Diagramm wird geladen', es: 'Cargando gráfico',
        it: 'Caricamento del grafico', ja: 'グラフを読み込み中', ko: '차트 불러오는 중', pt: 'Carregando gráfico',
        ru: 'Загрузка диаграммы', zh: '正在加载图表',
    },
    echartsWaiting: {
        en: 'Waiting for your approval', fr: 'En attente de votre accord', de: 'Wartet auf Ihre Zustimmung',
        es: 'Esperando tu aprobación', it: 'In attesa della tua approvazione', ja: '承認を待っています',
        ko: '승인을 기다리는 중', pt: 'Aguardando sua aprovação', ru: 'Ожидает вашего подтверждения', zh: '等待您的批准',
    },
    echartsNotRun: {
        en: 'No chart: the tool did not run.', fr: 'Pas de graphique : l’outil n’a pas été exécuté.',
        de: 'Kein Diagramm: Das Werkzeug wurde nicht ausgeführt.', es: 'Sin gráfico: la herramienta no se ejecutó.',
        it: 'Nessun grafico: lo strumento non è stato eseguito.', ja: 'グラフなし：ツールは実行されませんでした。',
        ko: '차트 없음: 도구가 실행되지 않았습니다.', pt: 'Sem gráfico: a ferramenta não foi executada.',
        ru: 'Нет диаграммы: инструмент не был запущен.', zh: '无图表：工具未运行。',
    },
    echartsFailed: {
        en: 'No chart: the tool failed.', fr: 'Pas de graphique : l’outil a échoué.',
        de: 'Kein Diagramm: Das Werkzeug ist fehlgeschlagen.', es: 'Sin gráfico: la herramienta falló.',
        it: 'Nessun grafico: lo strumento non è riuscito.', ja: 'グラフなし：ツールが失敗しました。',
        ko: '차트 없음: 도구가 실패했습니다.', pt: 'Sem gráfico: a ferramenta falhou.',
        ru: 'Нет диаграммы: инструмент завершился с ошибкой.', zh: '无图表：工具运行失败。',
    },
    echartsTableCut: {
        en: 'Only part of the data is listed.', fr: 'Seule une partie des données est listée.',
        de: 'Nur ein Teil der Daten ist aufgeführt.', es: 'Solo se muestra una parte de los datos.',
        it: 'È elencata solo una parte dei dati.', ja: 'データの一部のみを表示しています。',
        ko: '데이터의 일부만 표시됩니다.', pt: 'Apenas parte dos dados está listada.',
        ru: 'Показана только часть данных.', zh: '仅列出部分数据。',
    },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

/** The language part of the locale's tag: `pt-BR` → `pt`, none → `en`. */
export function languageOf(config: AparteConfig): string {
    const tag = config.getLocale().tag;
    return typeof tag === 'string' && tag ? tag.split('-')[0]!.toLowerCase() : 'en';
}

/** The word for `key`: the app's locale first, then this package's table, then English. */
export function word(config: AparteConfig, key: WordKey): string {
    const fromApp = (config.getLocale() as Record<string, unknown>)[key];
    if (typeof fromApp === 'string' && fromApp) return fromApp;
    const table: Word = WORDS[key];
    return table[languageOf(config) as Language] ?? table.en;
}
