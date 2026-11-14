/**
 * The words `<aparte-diff>` says, in the chat's language.
 *
 * Core's locale is a closed list of what CORE draws, so this plugin reads its own keys off
 * `getLocale()` and defaults them here: the app's locale first, then this table for the
 * chat's language (the ten `@aparte/locales` ships), then English.
 *
 *   aparteGlobalConfig.extendLocale({ diffCommentSubmit: 'Envoyer' });
 *
 * A count is a set of plural forms, each named by its `Intl.PluralRules` category, as core's
 * `turnTools` is: Russian needs `few` and `many`, Japanese, Korean and Chinese one form.
 */
import { pluralize, type AparteConfig } from '@aparte/core';

type Language = 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';
type Word = { en: string } & Partial<Record<Language, string>>;

export const WORDS = {
    /** A file's added lines, said to a screen reader beside the `+3` it shows. */
    diffAdded: {
        en: 'one:{n} line added|other:{n} lines added',
        fr: 'one:{n} ligne ajoutée|other:{n} lignes ajoutées',
        de: 'one:{n} Zeile hinzugefügt|other:{n} Zeilen hinzugefügt',
        es: 'one:{n} línea añadida|other:{n} líneas añadidas',
        it: 'one:{n} riga aggiunta|other:{n} righe aggiunte',
        ja: 'other:{n} 行追加',
        ko: 'other:{n}줄 추가됨',
        pt: 'one:{n} linha adicionada|other:{n} linhas adicionadas',
        ru: 'one:{n} строка добавлена|few:{n} строки добавлены|many:{n} строк добавлено|other:{n} строки добавлено',
        zh: 'other:新增 {n} 行',
    },
    /** A file's removed lines, said to a screen reader beside the `−1` it shows. */
    diffRemoved: {
        en: 'one:{n} line removed|other:{n} lines removed',
        fr: 'one:{n} ligne supprimée|other:{n} lignes supprimées',
        de: 'one:{n} Zeile entfernt|other:{n} Zeilen entfernt',
        es: 'one:{n} línea eliminada|other:{n} líneas eliminadas',
        it: 'one:{n} riga rimossa|other:{n} righe rimosse',
        ja: 'other:{n} 行削除',
        ko: 'other:{n}줄 삭제됨',
        pt: 'one:{n} linha removida|other:{n} linhas removidas',
        ru: 'one:{n} строка удалена|few:{n} строки удалены|many:{n} строк удалено|other:{n} строки удалено',
        zh: 'other:删除 {n} 行',
    },
    /** What the `+` of an added line says to a screen reader. */
    diffMarkerAdded: {
        en: 'added', fr: 'ajoutée', de: 'hinzugefügt', es: 'añadida', it: 'aggiunta',
        ja: '追加', ko: '추가됨', pt: 'adicionada', ru: 'добавлена', zh: '新增',
    },
    /** What the `−` of a removed line says to a screen reader. */
    diffMarkerRemoved: {
        en: 'removed', fr: 'supprimée', de: 'entfernt', es: 'eliminada', it: 'rimossa',
        ja: '削除', ko: '삭제됨', pt: 'removida', ru: 'удалена', zh: '删除',
    },
    /** The button over a run of unchanged lines the element can show. */
    diffShowUnchanged: {
        en: 'one:Show {n} unchanged line|other:Show {n} unchanged lines',
        fr: 'one:Afficher {n} ligne inchangée|other:Afficher {n} lignes inchangées',
        de: 'one:{n} unveränderte Zeile anzeigen|other:{n} unveränderte Zeilen anzeigen',
        es: 'one:Mostrar {n} línea sin cambios|other:Mostrar {n} líneas sin cambios',
        it: 'one:Mostra {n} riga invariata|other:Mostra {n} righe invariate',
        ja: 'other:変更のない {n} 行を表示',
        ko: 'other:변경되지 않은 {n}줄 표시',
        pt: 'one:Mostrar {n} linha inalterada|other:Mostrar {n} linhas inalteradas',
        ru: 'one:Показать {n} неизменённую строку|few:Показать {n} неизменённые строки|many:Показать {n} неизменённых строк|other:Показать {n} неизменённой строки',
        zh: 'other:显示 {n} 行未更改的内容',
    },
    /** A run of unchanged lines the diff does not hold (a unified diff's text), between two hunks. */
    diffUnchanged: {
        en: 'one:{n} unchanged line|other:{n} unchanged lines',
        fr: 'one:{n} ligne inchangée|other:{n} lignes inchangées',
        de: 'one:{n} unveränderte Zeile|other:{n} unveränderte Zeilen',
        es: 'one:{n} línea sin cambios|other:{n} líneas sin cambios',
        it: 'one:{n} riga invariata|other:{n} righe invariate',
        ja: 'other:変更のない {n} 行',
        ko: 'other:변경되지 않은 {n}줄',
        pt: 'one:{n} linha inalterada|other:{n} linhas inalteradas',
        ru: 'one:{n} неизменённая строка|few:{n} неизменённые строки|many:{n} неизменённых строк|other:{n} неизменённой строки',
        zh: 'other:{n} 行未更改',
    },
    /** A new file's tag, beside its path. */
    diffStatusAdded: {
        en: 'Added', fr: 'Ajouté', de: 'Neu', es: 'Añadido', it: 'Aggiunto',
        ja: '追加', ko: '추가됨', pt: 'Adicionado', ru: 'Добавлен', zh: '新增',
    },
    /** A deleted file's tag, beside its path. */
    diffStatusDeleted: {
        en: 'Deleted', fr: 'Supprimé', de: 'Gelöscht', es: 'Eliminado', it: 'Eliminato',
        ja: '削除', ko: '삭제됨', pt: 'Excluído', ru: 'Удалён', zh: '已删除',
    },
    /** A renamed file's tag, beside its paths. */
    diffStatusRenamed: {
        en: 'Renamed', fr: 'Renommé', de: 'Umbenannt', es: 'Renombrado', it: 'Rinominato',
        ja: '名前変更', ko: '이름 변경됨', pt: 'Renomeado', ru: 'Переименован', zh: '已重命名',
    },
    /** Where a binary file's lines would be. */
    diffBinary: {
        en: 'Binary file, no lines to show', fr: 'Fichier binaire, aucune ligne à afficher',
        de: 'Binärdatei, keine Zeilen anzuzeigen', es: 'Archivo binario, no hay líneas que mostrar',
        it: 'File binario, nessuna riga da mostrare', ja: 'バイナリファイルのため表示する行はありません',
        ko: '바이너리 파일이라 표시할 줄이 없습니다', pt: 'Arquivo binário, nenhuma linha para mostrar',
        ru: 'Двоичный файл, строк для показа нет', zh: '二进制文件，没有可显示的行',
    },
    /** Under the last line of a file that ends without a newline. */
    diffNoNewline: {
        en: 'No newline at end of file', fr: 'Pas de saut de ligne à la fin du fichier',
        de: 'Kein Zeilenumbruch am Dateiende', es: 'Sin salto de línea al final del archivo',
        it: 'Nessun a capo alla fine del file', ja: 'ファイル末尾に改行がありません',
        ko: '파일 끝에 줄바꿈 없음', pt: 'Sem quebra de linha no fim do arquivo',
        ru: 'Нет перевода строки в конце файла', zh: '文件末尾没有换行符',
    },
    /** An unchanged line's number, as its button and a comment name it. */
    diffLine: {
        en: 'Line {n}', fr: 'Ligne {n}', de: 'Zeile {n}', es: 'Línea {n}', it: 'Riga {n}',
        ja: '{n} 行目', ko: '{n}번째 줄', pt: 'Linha {n}', ru: 'Строка {n}', zh: '第 {n} 行',
    },
    /** An added line's number, as its button names it. */
    diffLineAdded: {
        en: 'Added line {n}', fr: 'Ligne ajoutée {n}', de: 'Hinzugefügte Zeile {n}', es: 'Línea añadida {n}',
        it: 'Riga aggiunta {n}', ja: '追加された {n} 行目', ko: '추가된 {n}번째 줄', pt: 'Linha adicionada {n}',
        ru: 'Добавленная строка {n}', zh: '新增的第 {n} 行',
    },
    /** A removed line's number, as its button and a comment name it. */
    diffLineRemoved: {
        en: 'Removed line {n}', fr: 'Ligne supprimée {n}', de: 'Entfernte Zeile {n}', es: 'Línea eliminada {n}',
        it: 'Riga rimossa {n}', ja: '削除された {n} 行目', ko: '삭제된 {n}번째 줄', pt: 'Linha removida {n}',
        ru: 'Удалённая строка {n}', zh: '删除的第 {n} 行',
    },
    /** A range a comment is on. */
    diffLines: {
        en: 'Lines {start}–{end}', fr: 'Lignes {start} à {end}', de: 'Zeilen {start}–{end}', es: 'Líneas {start}–{end}',
        it: 'Righe {start}–{end}', ja: '{start}〜{end} 行目', ko: '{start}~{end}번째 줄', pt: 'Linhas {start}–{end}',
        ru: 'Строки {start}–{end}', zh: '第 {start}–{end} 行',
    },
    /** A range of removed lines a comment is on. */
    diffLinesRemoved: {
        en: 'Removed lines {start}–{end}', fr: 'Lignes supprimées {start} à {end}', de: 'Entfernte Zeilen {start}–{end}',
        es: 'Líneas eliminadas {start}–{end}', it: 'Righe rimosse {start}–{end}', ja: '削除された {start}〜{end} 行目',
        ko: '삭제된 {start}~{end}번째 줄', pt: 'Linhas removidas {start}–{end}', ru: 'Удалённые строки {start}–{end}',
        zh: '删除的第 {start}–{end} 行',
    },
    /** The comment field's name, on one line. */
    diffCommentLine: {
        en: 'Comment on line {n}', fr: 'Commenter la ligne {n}', de: 'Zeile {n} kommentieren', es: 'Comentar la línea {n}',
        it: 'Commenta la riga {n}', ja: '{n} 行目にコメント', ko: '{n}번째 줄에 댓글', pt: 'Comentar a linha {n}',
        ru: 'Комментарий к строке {n}', zh: '评论第 {n} 行',
    },
    /** The comment field's name, on a range. */
    diffCommentLines: {
        en: 'Comment on lines {start}–{end}', fr: 'Commenter les lignes {start} à {end}', de: 'Zeilen {start}–{end} kommentieren',
        es: 'Comentar las líneas {start}–{end}', it: 'Commenta le righe {start}–{end}', ja: '{start}〜{end} 行目にコメント',
        ko: '{start}~{end}번째 줄에 댓글', pt: 'Comentar as linhas {start}–{end}', ru: 'Комментарий к строкам {start}–{end}',
        zh: '评论第 {start}–{end} 行',
    },
    /** What the empty comment field shows. */
    diffCommentPlaceholder: {
        en: 'Leave a comment', fr: 'Laisser un commentaire', de: 'Kommentar schreiben', es: 'Deja un comentario',
        it: 'Lascia un commento', ja: 'コメントを入力', ko: '댓글 남기기', pt: 'Deixe um comentário',
        ru: 'Оставьте комментарий', zh: '留下评论',
    },
    /** The button that sends the comment. */
    diffCommentSubmit: {
        en: 'Comment', fr: 'Commenter', de: 'Kommentieren', es: 'Comentar', it: 'Commenta',
        ja: 'コメント', ko: '댓글 달기', pt: 'Comentar', ru: 'Комментировать', zh: '评论',
    },
    /** The button that closes the comment field. */
    diffCommentCancel: {
        en: 'Cancel', fr: 'Annuler', de: 'Abbrechen', es: 'Cancelar', it: 'Annulla',
        ja: 'キャンセル', ko: '취소', pt: 'Cancelar', ru: 'Отмена', zh: '取消',
    },
    /** A comment kept to be sent. */
    diffCommentPending: {
        en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente', it: 'In attesa',
        ja: '保留中', ko: '대기 중', pt: 'Pendente', ru: 'Ожидает', zh: '待发送',
    },
    /** A comment that was sent. */
    diffCommentSent: {
        en: 'Sent', fr: 'Envoyé', de: 'Gesendet', es: 'Enviado', it: 'Inviato',
        ja: '送信済み', ko: '보냄', pt: 'Enviado', ru: 'Отправлен', zh: '已发送',
    },
    /** A diff with no change in it. */
    diffEmpty: {
        en: 'No changes', fr: 'Aucun changement', de: 'Keine Änderungen', es: 'Sin cambios', it: 'Nessuna modifica',
        ja: '変更はありません', ko: '변경 사항 없음', pt: 'Nenhuma alteração', ru: 'Изменений нет', zh: '没有更改',
    },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

/** The language part of the locale's tag: `pt-BR` → `pt`, `zh-CN` → `zh`, none → `en`. */
function languageOf(config: AparteConfig): string {
    const tag = config.getLocale().tag;
    return typeof tag === 'string' && tag ? tag.split('-')[0]!.toLowerCase() : 'en';
}

/**
 * The word for `key`: the app's locale, else this table in the chat's language, else English;
 * `{name}` slots filled from `vars`, and a count's plural form chosen when `vars.n` is a number.
 */
export function word(config: AparteConfig, key: WordKey, vars: Record<string, string | number> = {}): string {
    const fromApp = (config.getLocale() as Record<string, unknown>)[key];
    const table: Word = WORDS[key];
    let text = (typeof fromApp === 'string' && fromApp) || table[languageOf(config) as Language] || table.en;
    if (typeof vars['n'] === 'number' && /^(zero|one|two|few|many|other):/.test(text)) {
        const tag = config.getLocale().tag;
        text = pluralize(text, vars['n'], typeof tag === 'string' && tag ? tag : undefined);
    }
    return text.replace(/\{(\w+)\}/g, (slot, name: string) => (name in vars ? String(vars[name]) : slot));
}
