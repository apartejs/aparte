/**
 * Text as a search compares it: no accents, lower case, trimmed — so "Écrire" finds "ecrire".
 * Shared by the conversation list's filter and the sidebar's search field.
 */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Hide the conversation rows under `root` whose title does not contain `needle` (already
 * folded), and the date groups left with none; return how many rows match. An empty needle
 * shows everything. The conversation list runs it on every render; the sidebar runs it itself
 * on a list that has not upgraded yet, whose rows are the page's own markup.
 */
export function filterConversationRows(root: ParentNode, needle: string): number {
    let matches = 0;
    for (const row of root.querySelectorAll<HTMLElement>('[data-conv-id]')) {
        const title = row.querySelector('.aparte-conv-item__title')?.textContent ?? row.textContent ?? '';
        row.hidden = needle !== '' && !foldText(title).includes(needle);
        if (!row.hidden) matches++;
    }
    for (const group of root.querySelectorAll<HTMLElement>('.aparte-conv-group')) {
        group.hidden = needle !== '' && !Array.from(group.querySelectorAll<HTMLElement>('[data-conv-id]')).some((r) => !r.hidden);
    }
    return matches;
}
