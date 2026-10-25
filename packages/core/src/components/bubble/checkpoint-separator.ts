import type { AparteLocale } from '../../config/locale.js';

/** What the separator is saying: a summary written, an older one with no count, one being written, or one that failed. */
export type CheckpointKind = 'done' | 'legacy' | 'pending' | 'failed';

/** What {@link buildCheckpointSeparator} draws from. Plain data, so the bubble owns every decision. */
export interface CheckpointSeparatorOptions {
    kind: CheckpointKind;
    /** How many messages the summary stands for (`done` only). */
    count?: number;
    /** Why the summary could not be written (`failed` only). */
    reason?: string;
    /** The summary panel is open. */
    open: boolean;
    /** Restore asked "Send the original messages to the model again?" and waits for the answer. */
    confirming: boolean;
    /** The id the Show/Hide button points `aria-controls` at; unique on the page. */
    summaryId: string;
    locale: Partial<AparteLocale>;
}

/** An element with a class and, when given, text — built by DOM calls, so no string is ever parsed as HTML. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** One of the separator's actions: a ghost button at the small step, found again by `data-checkpoint-action`. */
function action(name: string, label: string): HTMLButtonElement {
    const button = el('button', 'aparte-btn aparte-btn--ghost aparte-btn--sm aparte-checkpoint__action', label);
    button.type = 'button';
    button.setAttribute('data-checkpoint-action', name);
    return button;
}

/**
 * The separator a bubble draws above the first message the model still reads verbatim.
 *
 * `<div role="group" aria-label>` holding a labelled divider (the hairline, the sentence,
 * the actions) and, below it, the panel the summary opens into. The panel is built empty:
 * the bubble fills it through the configured Markdown renderer when it is opened, because
 * what the summary looks like is the same decision the bubble makes for its own content.
 *
 * - `done`    "{n} messages summarised for the model", Show/Hide summary, Restore (or, once
 *             Restore was pressed, the question and its two answers in the actions' place).
 * - `legacy`  "Earlier messages were summarised": no count and no Restore — a message
 *             written by an older compaction replaced the turns, so there is nothing to
 *             restore them from.
 * - `pending` "Summarising the context…" under the shimmer recipe, no actions.
 * - `failed`  "Couldn't summarise the context" and Retry; the reason is the sentence's
 *             `title` and, for a reader of the accessible tree, visually hidden text.
 *
 * Every string comes from the locale with the English default beside it, the way the rest
 * of core reads its own: a locale written before these keys existed keeps working.
 */
export function buildCheckpointSeparator(options: CheckpointSeparatorOptions): HTMLElement {
    const { kind, locale } = options;
    const root = el('div', 'aparte-checkpoint');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', locale.checkpointGroup ?? 'Context summary');
    root.setAttribute('data-state', kind);

    const row = el('div', 'aparte-checkpoint__row aparte-divider aparte-divider--label');
    const label = el('div', 'aparte-checkpoint__label');
    row.appendChild(label);
    root.appendChild(row);

    let sentence: string;
    if (kind === 'done') {
        const n = options.count ?? 0;
        sentence = n === 1
            ? (locale.checkpointCountOne ?? '1 message summarised for the model')
            : (locale.checkpointCount ?? '{n} messages summarised for the model').replace('{n}', () => String(n));
    } else if (kind === 'legacy') {
        sentence = locale.checkpointLegacy ?? 'Earlier messages were summarised';
    } else if (kind === 'pending') {
        sentence = locale.checkpointPending ?? 'Summarising the context…';
    } else {
        sentence = locale.checkpointFailed ?? "Couldn't summarise the context";
    }

    const text = el('span', 'aparte-checkpoint__text', sentence);
    if (kind === 'pending') {
        text.classList.add('aparte-shimmer');
        text.setAttribute('role', 'status');
    } else if (kind === 'failed') {
        text.setAttribute('role', 'status');
        if (options.reason) {
            text.title = options.reason;
            text.appendChild(el('span', 'aparte-sr-only', `: ${options.reason}`));
        }
    }
    label.appendChild(text);

    if (kind === 'done' || kind === 'legacy') {
        if (options.confirming && kind === 'done') {
            const confirm = el('span', 'aparte-checkpoint__confirm');
            const question = el('span', 'aparte-checkpoint__question', locale.checkpointRestoreConfirm ?? 'Send the original messages to the model again?');
            question.id = `${options.summaryId}-question`;
            const yes = action('restore-confirm', locale.checkpointRestore ?? 'Restore');
            yes.setAttribute('aria-describedby', question.id);
            confirm.append(question, yes, action('restore-cancel', locale.cancel ?? 'Cancel'));
            label.appendChild(confirm);
        } else {
            const toggle = action('toggle', options.open ? (locale.checkpointHide ?? 'Hide summary') : (locale.checkpointShow ?? 'Show summary'));
            toggle.setAttribute('aria-expanded', String(options.open));
            toggle.setAttribute('aria-controls', options.summaryId);
            label.appendChild(toggle);
            if (kind === 'done') label.appendChild(action('restore', locale.checkpointRestore ?? 'Restore'));
        }
    } else if (kind === 'failed') {
        label.appendChild(action('retry', locale.retry ?? 'Retry'));
    }

    if (kind === 'done' || kind === 'legacy') {
        // The summary is Markdown the model wrote, and prose.css styles it under three
        // scopes — the message content, a segment's content, a thinking panel's. The first
        // is the one the bubble looks up by class and this panel sits OUTSIDE the message,
        // so it wears the second: lists, quotes, links and code come out drawn instead of
        // as the browser's own.
        const panel = el('div', 'aparte-checkpoint__summary aparte-segment-content');
        panel.id = options.summaryId;
        if (!options.open) panel.hidden = true;
        root.appendChild(panel);
    }
    return root;
}
