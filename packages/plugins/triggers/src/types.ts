import type { AparteCommand, AparteCommandContext, AparteComposerToken } from '@aparte/core';

/** A list asked for on demand: each search, or the first time a submenu opens. */
export type AparteTriggerSource = (
    query: string,
    context: { signal: AbortSignal; trigger: AparteTrigger },
) => readonly AparteTriggerItem[] | Promise<readonly AparteTriggerItem[]>;

/** One row of the menu. Without `run`, `insert` or `children`, choosing it inserts a token. */
export interface AparteTriggerItem {
    id: string;
    label: string;
    description?: string;
    /** A core icon's name, a short text such as an emoji, or an element. */
    icon?: string | HTMLElement;
    /** Rows of one group sit together under its name, while nothing is being searched. */
    group?: string;
    /** More words a search finds this row by. */
    keywords?: readonly string[];
    disabled?: boolean;
    /** Yours: it comes back with the row, and on the token a row inserts by default. */
    data?: unknown;
    /** A submenu: a list, or a function asked once when it opens. Any depth. */
    children?: readonly AparteTriggerItem[] | AparteTriggerSource;
    /** Draw the inside of the row yourself. A string is written as HTML, so escape what you put in it. */
    render?: (item: AparteTriggerItem) => HTMLElement | string;
    /** What choosing the row does. The trigger's text is removed first, unless `insert` replaces it. */
    run?: (context: AparteTriggerContext) => void | Promise<void>;
    /** What replaces the trigger's text: plain text, or a token. */
    insert?: string | AparteComposerToken;
}

export type { AparteCommand, AparteCommandScope, AparteCommandContext, AparteCollectCommandsEventDetail } from '@aparte/core';

/** What a row receives when it is chosen. */
export interface AparteTriggerContext extends AparteCommandContext {
    item: AparteTriggerItem;
}

/** What an app decides about the commands the plugins added. Applied last, so it always wins. */
export interface AparteTriggerCommands {
    /** Ids to leave out. */
    exclude?: readonly string[];
    /** Changes to a command, by id: its label, its order, or what it does. */
    override?: Readonly<Record<string, Partial<Omit<AparteCommand, 'id'>>>>;
}

/** One character (or several) that opens a menu. */
export interface AparteTrigger {
    char: string;
    /** `message`: only at the very start of the draft. `word`: at the start of any word. Default `word`. */
    at?: 'message' | 'word';
    items?: readonly AparteTriggerItem[] | AparteTriggerSource;
    /** Also list the commands plugins add. */
    commands?: boolean | AparteTriggerCommands;
    /** Replace the search. Return a score (higher comes first), or a boolean. */
    match?: (item: AparteTriggerItem, query: string) => number | boolean;
    /** The `kind` of the token a row inserts by default. */
    kind?: string;
    /** Wait this long after a keystroke before asking a source, in ms. Default 150. */
    debounce?: number;
    /** A search can hold spaces, for full names. It still ends at a line break. */
    allowSpaces?: boolean;
    /** At most this many rows. */
    maxItems?: number;
}

export type { AparteTriggerSelectEventDetail } from '@aparte/core';
