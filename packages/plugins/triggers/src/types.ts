import type { AparteComposer, AparteComposerInput, AparteComposerToken, AparteConfig } from '@aparte/core';

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

/** The chat a row or a command acts on. */
export interface AparteCommandScope {
    config: AparteConfig;
    composer: AparteComposer;
    /** The `<aparte-chat>` or `[data-aparte-chat]` above the composer. */
    chat: HTMLElement | null;
    /** The id `aparte-*` events name this chat by. */
    targetId: string | undefined;
}

export interface AparteTriggerContext extends AparteCommandScope {
    item: AparteTriggerItem;
    query: string;
    input: AparteComposerInput;
    /** Say something beside the composer for a few seconds: why a command did nothing. */
    notify(text: string): void;
}

/** A command another plugin, or your app, adds to the list. */
export interface AparteCommand {
    /** The same id twice: the last one answering wins. */
    id: string;
    /** What is typed after the trigger. Defaults to `id`. */
    name?: string;
    /** Defaults to the trigger followed by `name`. */
    label?: string;
    description?: string;
    icon?: string | HTMLElement;
    group?: string;
    keywords?: readonly string[];
    /** Lower comes first. Default 100. */
    order?: number;
    hidden?: boolean;
    /** Asked each time the menu opens. A command that cannot act here is not listed. */
    enabled?: (scope: AparteCommandScope) => boolean;
    run?: (context: AparteTriggerContext) => void | Promise<void>;
    children?: readonly AparteCommand[] | ((scope: AparteCommandScope) => readonly AparteCommand[]);
}

/**
 * The event `<aparte-triggers>` sends up when a menu with commands opens. A plugin that has
 * a command listens on `window`, checks `config` is its own, and calls `add`. Neither side
 * imports the other: with no menu on the page nobody asks, and with no contributor nobody
 * answers.
 */
export interface AparteCollectCommandsDetail {
    config: AparteConfig;
    chat: HTMLElement | null;
    composer: AparteComposer;
    add(command: AparteCommand): void;
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

/** Sent, and cancelable, when a row is chosen: `preventDefault()` leaves the draft to you. */
export interface AparteTriggerSelectEventDetail {
    trigger: AparteTrigger;
    item: AparteTriggerItem;
    query: string;
}
