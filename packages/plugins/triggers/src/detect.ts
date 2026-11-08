import type { AparteTrigger } from './types.js';

/** What a token counts as in the text the composer reports. */
const TOKEN_CHAR = '￼';
/** What can stand before a trigger at the start of a word. Not a letter: `a@b.c` and `https://x` open nothing. */
const BEFORE_WORD = /[\s([{"'«￼]/;
/** A longer run is not a search any more. */
const MAX_QUERY = 64;

export interface TriggerHit {
    trigger: AparteTrigger;
    /** Where the trigger's characters start in the draft. */
    start: number;
    /** The caret: where the search ends. */
    end: number;
    query: string;
}

function hitOf(trigger: AparteTrigger, before: string): TriggerHit | null {
    const start = before.lastIndexOf(trigger.char);
    if (start < 0) return null;
    if ((trigger.at ?? 'word') === 'message') {
        if (before.slice(0, start).trim() !== '') return null;
    } else if (start > 0 && !BEFORE_WORD.test(before[start - 1]!)) {
        return null;
    }
    const query = before.slice(start + trigger.char.length);
    if (query.length > MAX_QUERY || query.includes(TOKEN_CHAR)) return null;
    if (trigger.allowSpaces ? query.includes('\n') || query.startsWith(' ') : /\s/.test(query)) return null;
    return { trigger, start, end: before.length, query };
}

/** The trigger the caret is in, or `null`. Of several, the one nearest the caret. */
export function detectTrigger(text: string, offset: number, triggers: readonly AparteTrigger[]): TriggerHit | null {
    const before = text.slice(0, offset);
    let best: TriggerHit | null = null;
    for (const trigger of triggers) {
        const hit = hitOf(trigger, before);
        if (hit && (!best || hit.start > best.start)) best = hit;
    }
    return best;
}
