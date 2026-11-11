/**
 * `connectArtifactPanel()` — the wiring between a chat, a document panel and the layout.
 *
 * The panel shows a document and decides nothing about where it sits; the card's Open
 * button only says "open this". This is the handful of lines in between, written once:
 * Open shows that version in the panel and opens the pane, Close folds it and gives the
 * focus back. An app with its own layout reads this file and writes its own.
 */
import { resolveConfig } from '@aparte/core';
import { renderOptions, setRenderOptions } from '../options.js';
import type { AparteArtifactPanel } from './aparte-artifact-panel.js';

/** The part of `<aparte-split>` this needs: one pane or two, and which one. */
export interface ArtifactPanelSplit extends HTMLElement {
    single: boolean;
    pane: 'start' | 'end';
}

export interface ConnectArtifactPanelOptions {
    /** The chat whose cards open in the panel: the element their `aparte-artifact-open` bubbles through. */
    chat: HTMLElement;
    /** The panel. */
    panel: AparteArtifactPanel;
    /**
     * The `<aparte-split>` that holds the chat and the panel, when there is one: it is
     * opened on the panel's pane and folded back to the chat's. Without it, show and hide
     * the panel yourself from `onOpen` and `onClose`.
     */
    split?: ArtifactPanelSplit;
    /** Which pane of the split the panel is in. Default `end`. */
    pane?: 'start' | 'end';
    /**
     * Open the panel by itself when a turn writes a document or a new version of one.
     * Off by default: the panel opens when somebody presses a card's Open button. A
     * conversation that is opened never opens it (what it holds is not news), and on a
     * narrow screen, where the split shows one pane, the reader stays on the chat.
     */
    autoOpen?: boolean;
    /** After the panel was given a document to show: your own layout's turn. */
    onOpen?: () => void;
    /** After Close or Escape, or when the conversation shown has no document: your own layout's turn. */
    onClose?: () => void;
}

/**
 * Wire a chat's document cards to a panel. Returns a function that undoes all of it.
 *
 * It turns the card's Open button on for this chat, since it is what listens to it
 * (an Open button with nobody listening would be a button that does nothing).
 */
export function connectArtifactPanel(options: ConnectArtifactPanelOptions): () => void {
    const { chat, panel, split } = options;
    const panelPane = options.pane ?? 'end';
    const chatPane = panelPane === 'end' ? 'start' : 'end';

    // The Open button, for the config this chat resolves.
    const config = resolveConfig(chat);
    const before = renderOptions(config);
    setRenderOptions(config, { ...before, open: true });

    if (!panel.chat && !panel.getAttribute('for')) panel.chat = chat;

    /** The card whose button opened the panel, to give the focus back to. */
    let opener: HTMLElement | null = null;

    const open = (focus: boolean): void => {
        if (split) {
            split.pane = panelPane;
            split.single = false;
        }
        options.onOpen?.();
        if (focus) panel.focusTitle();
    };
    const fold = (): void => {
        if (split) {
            split.pane = chatPane;
            split.single = true;
        }
        options.onClose?.();
    };

    const onOpen = (event: Event): void => {
        const { documentId, segmentId } = (event as HTMLElementEventMap['aparte-artifact-open']).detail;
        const target = event.target as HTMLElement | null;
        opener = target?.querySelector<HTMLElement>('[data-action="open"]') ?? target;
        panel.show(documentId, { segmentId });
        open(true);
    };
    const onClose = (): void => {
        // Where the focus is before the pane goes: in the panel, or nowhere (a browser that
        // does not focus a button it is clicked on leaves it on the page's body).
        const active = panel.ownerDocument.activeElement;
        const adrift = !active || active === panel.ownerDocument.body || panel.contains(active);
        fold();
        // Back where the reader was: the button that opened the panel, if it is still
        // there; else the composer, so the focus is not left on a pane that is gone.
        if (opener?.isConnected) opener.focus();
        else if (adrift) focusComposer(chat);
        opener = null;
    };

    // ── A document written during a turn ──────────────────────────────────
    let turn = false;
    let known = signature(panel);
    let queued = false;
    /** After the panel's own reading (it reads on the next frame): did a document appear or change? */
    const afterNextRead = (then: (changed: boolean, any: boolean) => void): void => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            panel.refresh();
            const now = signature(panel);
            const changed = now !== known;
            known = now;
            then(changed, now !== '');
        });
    };
    const onWritten = (): void => {
        // Only what a turn writes is news: cards drawn when a conversation is opened are not.
        if (!turn) return;
        afterNextRead((changed, any) => {
            if (!changed || !any || !options.autoOpen) return;
            // One pane at a time (a phone): the reader stays on the chat, where the card is.
            if (split?.hasAttribute('data-stacked')) return;
            // The document just written, at its latest version.
            panel.removeAttribute('document-id');
            panel.removeAttribute('version');
            panel.refresh();
            open(false);
        });
    };
    const onStart = (): void => { turn = true; };
    const onEnd = (): void => {
        onWritten();
        turn = false;
    };
    // Another conversation: nothing pinned from the last one, and no pane open on nothing.
    const onLoaded = (): void => {
        panel.removeAttribute('document-id');
        panel.removeAttribute('version');
        opener = null;
        afterNextRead((_changed, any) => { if (!any) fold(); });
    };

    chat.addEventListener('aparte-artifact-open', onOpen);
    panel.addEventListener('aparte-artifact-panel-close', onClose);
    chat.addEventListener('aparte-message-start', onStart);
    chat.addEventListener('aparte-artifact-change', onWritten);
    for (const name of ['aparte-message-done', 'aparte-message-aborted', 'aparte-message-error'] as const) chat.addEventListener(name, onEnd);
    for (const name of ['aparte-conversation-loaded', 'aparte-reset-done'] as const) chat.addEventListener(name, onLoaded);

    // Nothing to show yet: the split shows the chat alone.
    if (split && panel.hasAttribute('data-empty')) {
        split.pane = chatPane;
        split.single = true;
    }

    return () => {
        chat.removeEventListener('aparte-artifact-open', onOpen);
        panel.removeEventListener('aparte-artifact-panel-close', onClose);
        chat.removeEventListener('aparte-message-start', onStart);
        chat.removeEventListener('aparte-artifact-change', onWritten);
        for (const name of ['aparte-message-done', 'aparte-message-aborted', 'aparte-message-error'] as const) chat.removeEventListener(name, onEnd);
        for (const name of ['aparte-conversation-loaded', 'aparte-reset-done'] as const) chat.removeEventListener(name, onLoaded);
        setRenderOptions(config, before);
    };
}

/** Put the focus in the chat's composer: core's input when the chat has one, else nothing. */
function focusComposer(chat: HTMLElement): void {
    const input = chat.querySelector<HTMLElement & { focusEnd?: () => void }>('aparte-composer-input');
    if (!input) return;
    if (typeof input.focusEnd === 'function') input.focusEnd();
    else input.focus();
}

/** What the conversation's documents look like, to tell when one appeared or changed. */
function signature(panel: AparteArtifactPanel): string {
    return panel.readDocuments().map((d) => `${d.id}:${d.versions.length}`).join(',');
}
