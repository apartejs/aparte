import type { AparteTrigger, AparteTriggerItem } from './types.js';

/** A row and the labels above it, shown once a search has flattened the submenus. */
export interface TriggerRow {
    item: AparteTriggerItem;
    path: readonly string[];
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const LEADING_MARKS = /^[^\p{L}\p{N}]+/u;

/** 3 when a name starts with the search, 2 when it holds it, 1 when the description does, 0 otherwise. */
export function scoreItem(item: AparteTriggerItem, query: string): number {
    if (!query) return 1;
    const wanted = fold(query);
    const names = [item.label, ...(item.keywords ?? [])].map(fold);
    if (names.some((name) => name.replace(LEADING_MARKS, '').startsWith(wanted))) return 3;
    if (names.some((name) => name.includes(wanted))) return 2;
    return item.description && fold(item.description).includes(wanted) ? 1 : 0;
}

function flatten(items: readonly AparteTriggerItem[], path: readonly string[], out: TriggerRow[]): TriggerRow[] {
    for (const item of items) {
        out.push({ item, path });
        if (Array.isArray(item.children)) flatten(item.children as readonly AparteTriggerItem[], [...path, item.label], out);
    }
    return out;
}

/** The rows for a search, best first. A search looks inside submenus that are already known. */
export function matchRows(items: readonly AparteTriggerItem[], query: string, trigger: AparteTrigger): TriggerRow[] {
    const rows = query ? flatten(items, [], []) : items.map((item) => ({ item, path: [] as readonly string[] }));
    const scored = rows
        .map((row) => {
            const custom = trigger.match?.(row.item, query);
            const score = custom === undefined ? scoreItem(row.item, query) : Number(custom);
            return { row, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ row }) => row);
    return trigger.maxItems ? scored.slice(0, trigger.maxItems) : scored;
}

/** Rows of a group brought together, the groups in the order they first appear. */
export function groupRows(rows: readonly TriggerRow[]): Array<{ group: string | undefined; rows: TriggerRow[] }> {
    const groups: Array<{ group: string | undefined; rows: TriggerRow[] }> = [];
    for (const row of rows) {
        const found = groups.find(({ group }) => group === row.item.group);
        if (found) found.rows.push(row);
        else groups.push({ group: row.item.group, rows: [row] });
    }
    return groups;
}
