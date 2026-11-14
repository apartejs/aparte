/**
 * `connectSubagentView()` — the wiring between a chat, a sub-agent's view and the layout.
 *
 * The line only says "open this" (`aparte-subagent-open`, with `setupSubagents({ open:
 * 'event' })`), and the view shows whichever sub-agent it is pointed at and decides nothing
 * about where it sits. This is the handful of lines in between, written once: an Open shows
 * that sub-agent in the view, marks its line and opens the pane; Close (or Escape) folds it,
 * clears the mark and gives the focus back. An app with its own layout reads this file and
 * writes its own.
 */
import type { AparteSubagentView } from './aparte-subagent-view.js';
import { markRow, openButtonOf, setShown, unmarkAll } from './open.js';
import type { AparteSubagentOpenEventDetail } from './types.js';

/** The part of `<aparte-split>` this needs: one pane or two, and which one. */
export interface SubagentViewSplit extends HTMLElement {
    single: boolean;
    pane: 'start' | 'end';
}

export interface ConnectSubagentViewOptions {
    /** The chat whose sub-agents' lines open in the view: the element their `aparte-subagent-open` bubbles through. */
    chat: HTMLElement;
    /** The view. It is made `closable` while connected (its name and a Close button), and given the chat when it reads none. */
    view: AparteSubagentView;
    /**
     * The `<aparte-split>` that holds the chat and the view, when there is one: it is opened on
     * the view's pane and folded back to the chat's. Without it, show and hide the view
     * yourself from `onOpen` and `onClose`.
     */
    split?: SubagentViewSplit;
    /** Which pane of the split the view is in. Default `end`. */
    pane?: 'start' | 'end';
    /** After the view was pointed at a sub-agent: your own layout's turn. */
    onOpen?: (detail: AparteSubagentOpenEventDetail) => void;
    /** After Close or Escape, or another conversation: your own layout's turn. */
    onClose?: () => void;
}

/**
 * Wire a chat's sub-agent lines to a view. Returns a function that undoes all of it.
 *
 * The lines need `setupSubagents({ open: 'event' })` for their Open button: that is the setup's
 * option, not this function's, since a line drawn before the wiring exists is drawn already.
 * A sub-agent's own sub-agents, drawn as lines inside the view, open in the same view.
 */
export function connectSubagentView(options: ConnectSubagentViewOptions): () => void {
    const { chat, view, split } = options;
    const viewPane = options.pane ?? 'end';
    const chatPane = viewPane === 'end' ? 'start' : 'end';
    /** Who shows a sub-agent, for the lines drawn later. */
    const owner = {};

    if (!view.chat && !view.getAttribute('for')) view.chat = chat;
    const wasClosable = view.hasAttribute('closable');
    view.setAttribute('closable', '');

    /** The line whose button opened the view, to mark and to give the focus back to, and what it said. */
    let opener: HTMLElement | null = null;
    let opened: AparteSubagentOpenEventDetail | null = null;
    let isOpen = false;

    const roots = (): ParentNode[] => (chat.contains(view) ? [chat] : [chat, view]);
    const mark = (row: HTMLElement | null): void => {
        for (const root of roots()) unmarkAll(root);
        if (row) markRow(row, true);
    };

    const fold = (): void => {
        if (split) {
            split.pane = chatPane;
            split.single = true;
        }
        isOpen = false;
        options.onClose?.();
    };

    const onOpen = (event: Event): void => {
        const detail = (event as HTMLElementEventMap['aparte-subagent-open']).detail;
        if (!detail?.messageId || !detail.agentId) return;
        const row = event.target instanceof HTMLElement ? event.target : null;
        opener = row;
        opened = detail;
        setShown(owner, { messageId: detail.messageId, agentId: detail.agentId });
        mark(row);
        view.setAttribute('message-id', detail.messageId);
        view.setAttribute('agent-id', detail.agentId);
        if (split) {
            // Two panes first, from the chat alone: the split moves from what is on screen.
            // Naming the pane first would show the view alone for a frame. Stacked (a phone),
            // the split shows the pane it is told: the view.
            split.single = false;
            split.pane = viewPane;
        }
        isOpen = true;
        options.onOpen?.(detail);
        view.focusTitle();
    };

    const close = (giveFocusBack: boolean): void => {
        // Where the focus is before the pane goes: in the view, or nowhere.
        const active = view.ownerDocument.activeElement;
        const adrift = !active || active === view.ownerDocument.body || view.contains(active);
        setShown(owner, null);
        mark(null);
        fold();
        if (giveFocusBack) {
            // Back where the reader was: the button that opened the view, if it is still there;
            // else the composer, so the focus is not left on a pane that is gone.
            const line = opener?.isConnected ? opener : lineOf(opened);
            const button = line ? openButtonOf(line) : null;
            if (button) button.focus();
            else if (adrift) focusComposer(chat);
        }
        opener = null;
        opened = null;
    };
    /**
     * The line of the sub-agent shown, drawn again since it was pressed (a framework redraws a
     * reply when it ends): a call's row by its call id, a sub-agent of the plugin's own by its id.
     */
    const lineOf = (detail: AparteSubagentOpenEventDetail | null): HTMLElement | null => {
        if (!detail) return null;
        const id = detail.toolCallId ?? detail.agentId;
        for (const root of roots()) {
            for (const row of root.querySelectorAll<HTMLElement>('.aparte-segment-tool-call[data-tool-call-id]')) {
                if (row.getAttribute('data-tool-call-id') === id && openButtonOf(row)) return row;
            }
        }
        return null;
    };
    const onClose = (): void => close(true);
    // Another conversation: nothing of the last one shown, and no pane open on nothing.
    const onLoaded = (): void => {
        if (isOpen || opened) close(false);
        view.removeAttribute('message-id');
        view.removeAttribute('agent-id');
    };

    chat.addEventListener('aparte-subagent-open', onOpen);
    // A sub-agent's own sub-agents are lines inside the view: they open here too.
    const viewListens = !chat.contains(view);
    if (viewListens) view.addEventListener('aparte-subagent-open', onOpen);
    view.addEventListener('aparte-subagent-view-close', onClose);
    for (const name of ['aparte-conversation-loaded', 'aparte-reset-done'] as const) chat.addEventListener(name, onLoaded);

    // Nothing shown yet: the split shows the chat alone.
    if (split && !view.getAttribute('agent-id')) {
        split.pane = chatPane;
        split.single = true;
    }

    return () => {
        chat.removeEventListener('aparte-subagent-open', onOpen);
        if (viewListens) view.removeEventListener('aparte-subagent-open', onOpen);
        view.removeEventListener('aparte-subagent-view-close', onClose);
        for (const name of ['aparte-conversation-loaded', 'aparte-reset-done'] as const) chat.removeEventListener(name, onLoaded);
        setShown(owner, null);
        mark(null);
        if (!wasClosable) view.removeAttribute('closable');
    };
}

/**
 * Put the focus in the chat's composer: core's input when the chat has one, else nothing. Only
 * an element core never upgraded lacks `focusEnd`, and that one has no editor to take the
 * focus either: nothing to fall back on.
 */
function focusComposer(chat: HTMLElement): void {
    chat.querySelector<HTMLElement & { focusEnd?: () => void }>('aparte-composer-input')?.focusEnd?.();
}
