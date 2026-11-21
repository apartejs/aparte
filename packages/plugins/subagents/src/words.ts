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
    /** What a sub-agent's second line says before its first call. */
    subagentsStarting: {
        en: 'Starting…', fr: 'Démarrage…', de: 'Wird gestartet…', es: 'Iniciando…', it: 'Avvio…',
        ja: '開始しています…', ko: '시작하는 중…', pt: 'Iniciando…', ru: 'Запуск…', zh: '正在启动…',
    },
    /** The name of a sub-agent that was given none, when no call names its line either. */
    subagentsUnnamed: {
        en: 'Sub-agent', fr: 'Sous-agent', de: 'Subagent', es: 'Subagente', it: 'Sottoagente',
        ja: 'サブエージェント', ko: '하위 에이전트', pt: 'Subagente', ru: 'Субагент', zh: '子智能体',
    },
    /** The Open button on a sub-agent's line (`setupSubagents({ open: 'event' })`): its name and tooltip. */
    subagentsOpen: {
        en: 'Open {name}', fr: 'Ouvrir {name}', de: '{name} öffnen', es: 'Abrir {name}', it: 'Apri {name}',
        ja: '{name} を開く', ko: '{name} 열기', pt: 'Abrir {name}', ru: 'Открыть: {name}', zh: '打开 {name}',
    },
    /** How many sub-agents a fold holds, first on its line (`subagentsTurnLabel`): "3 sub-agents". */
    subagentsCount: {
        en: 'one:{n} sub-agent|other:{n} sub-agents',
        fr: 'one:{n} sous-agent|other:{n} sous-agents',
        de: 'one:{n} Subagent|other:{n} Subagenten',
        es: 'one:{n} subagente|other:{n} subagentes',
        it: 'one:{n} sottoagente|other:{n} sottoagenti',
        ja: 'other:{n} 個のサブエージェント',
        ko: 'other:하위 에이전트 {n}개',
        pt: 'one:{n} subagente|other:{n} subagentes',
        ru: 'one:{n} субагент|few:{n} субагента|many:{n} субагентов|other:{n} субагента',
        zh: 'other:{n} 个子智能体',
    },
    /** Of those, how many are working. */
    subagentsRunning: {
        en: 'other:{n} running', fr: 'other:{n} en cours', de: 'other:{n} aktiv', es: 'other:{n} en curso',
        it: 'other:{n} in corso', ja: 'other:実行中 {n}', ko: 'other:실행 중 {n}', pt: 'other:{n} em andamento',
        ru: 'other:{n} в работе', zh: 'other:{n} 个运行中',
    },
    /** How many wait for a person. */
    subagentsWaiting: {
        en: 'other:{n} waiting', fr: 'other:{n} en attente', de: 'other:{n} wartend', es: 'other:{n} en espera',
        it: 'other:{n} in attesa', ja: 'other:待機中 {n}', ko: 'other:대기 중 {n}', pt: 'other:{n} aguardando',
        ru: 'other:{n} ожидает', zh: 'other:{n} 个等待中',
    },
    /** How many are done. */
    subagentsDone: {
        en: 'other:{n} done', fr: 'one:{n} terminé|other:{n} terminés', de: 'other:{n} fertig', es: 'one:{n} terminado|other:{n} terminados',
        it: 'one:{n} completato|other:{n} completati', ja: 'other:完了 {n}', ko: 'other:완료 {n}', pt: 'one:{n} concluído|other:{n} concluídos',
        ru: 'other:{n} готово', zh: 'other:{n} 个已完成',
    },
    /** How many failed. */
    subagentsFailed: {
        en: 'other:{n} failed', fr: 'other:{n} en échec', de: 'other:{n} fehlgeschlagen', es: 'one:{n} fallido|other:{n} fallidos',
        it: 'one:{n} non riuscito|other:{n} non riusciti', ja: 'other:失敗 {n}', ko: 'other:실패 {n}', pt: 'one:{n} com falha|other:{n} com falha',
        ru: 'other:{n} с ошибкой', zh: 'other:{n} 个失败',
    },
    /** The state of a sub-agent whose run stopped before it answered (`partial`), on its line. */
    subagentsCutShort: {
        en: 'Cut short', fr: 'Interrompu', de: 'Abgebrochen', es: 'Interrumpido', it: 'Interrotto',
        ja: '途中で終了', ko: '중간에 종료됨', pt: 'Interrompido', ru: 'Прерван', zh: '已中断',
    },
    /** How many were cut short, in a fold's line. */
    subagentsCutShortCount: {
        en: 'other:{n} cut short', fr: 'one:{n} interrompu|other:{n} interrompus', de: 'other:{n} abgebrochen', es: 'one:{n} interrumpido|other:{n} interrumpidos',
        it: 'one:{n} interrotto|other:{n} interrotti', ja: 'other:途中で終了 {n}', ko: 'other:중간에 종료됨 {n}', pt: 'one:{n} interrompido|other:{n} interrompidos',
        ru: 'other:{n} прервано', zh: 'other:{n} 个已中断',
    },
    /** How many were stopped. */
    subagentsStopped: {
        en: 'other:{n} stopped', fr: 'one:{n} arrêté|other:{n} arrêtés', de: 'other:{n} gestoppt', es: 'one:{n} detenido|other:{n} detenidos',
        it: 'one:{n} interrotto|other:{n} interrotti', ja: 'other:停止 {n}', ko: 'other:중지됨 {n}', pt: 'one:{n} interrompido|other:{n} interrompidos',
        ru: 'other:{n} остановлено', zh: 'other:{n} 个已停止',
    },
    /** The Close button of a `<aparte-subagent-view closable>`. */
    subagentsClose: {
        en: 'Close', fr: 'Fermer', de: 'Schließen', es: 'Cerrar', it: 'Chiudi',
        ja: '閉じる', ko: '닫기', pt: 'Fechar', ru: 'Закрыть', zh: '关闭',
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
    return counted(config, 'subagentsTools', n);
}

/** The count word `key` for `n`, in the chat's language and its plural rules. */
export function counted(config: AparteConfig, key: WordKey, n: number): string {
    const tag = config.getLocale().tag;
    return pluralize(word(config, key), n, typeof tag === 'string' && tag ? tag : undefined);
}
