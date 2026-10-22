/**
 * Text as a search compares it: no accents, lower case, trimmed — so "Écrire" finds "ecrire".
 * Shared by the conversation list's filter and the sidebar's search field.
 */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
