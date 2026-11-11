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
     * Open the panel by itself when a document appears or gets a new version in a turn.
     * Off by default: the panel opens when somebody presses a card's Open button. On a
     * narrow screen, where the split shows one pane, it stays on the chat either way.
     */
    autoOpen?: boolean;
    /** After the panel was given a document to show: your own layout's turn. */
    onOpen?: () => void;
    /** After Close or Escape: your own layout's turn. */
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
    const close = (): void => {
        if (split) {
            split.pane = chatPane;
            split.single = true;
        }
        options.onClose?.();
        // Back where the reader was: the button that opened the panel, if it is still there.
        if (opener?.isConnected) opener.focus();
        opener = null;
    };

    const onOpen = (event: Event): void => {
        const { documentId, segmentId } = (event as HTMLElementEventMap['aparte-artifact-open']).detail;
        const target = event.target as HTMLElement | null;
        opener = target?.querySelector<HTMLElement>('[data-action="open"]') ?? target;
        panel.show(documentId, { segmentId });
        open(true);
    };
    const onClose = (): void => close();

    // A new document, or a new version, written during a turn.
    let known = signature(panel);
    const onDone = (): void => {
        // The panel reads the conversation on the next frame; ask after it.
        requestAnimationFrame(() => {
            const now = signature(panel, true);
            const changed = now !== known;
            known = now;
            if (!changed || !options.autoOpen || now === '') return;
            // One pane at a time (a phone): the reader stays on the chat, where the card is.
            if (split?.hasAttribute('data-stacked')) return;
            panel.removeAttribute('document-id');
            panel.removeAttribute('version');
            panel.refresh();
            open(false);
        });
    };
    // A conversation was opened: what it holds is not news.
    const onLoaded = (): void => { requestAnimationFrame(() => { known = signature(panel, true); }); };

    chat.addEventListener('aparte-artifact-open', onOpen);
    panel.addEventListener('aparte-artifact-panel-close', onClose);
    chat.addEventListener('aparte-message-done', onDone);
    chat.addEventListener('aparte-conversation-loaded', onLoaded);
    chat.addEventListener('aparte-reset-done', onLoaded);

    // Nothing to show yet: the split shows the chat alone.
    if (split && panel.hasAttribute('data-empty')) {
        split.pane = chatPane;
        split.single = true;
    }

    return () => {
        chat.removeEventListener('aparte-artifact-open', onOpen);
        panel.removeEventListener('aparte-artifact-panel-close', onClose);
        chat.removeEventListener('aparte-message-done', onDone);
        chat.removeEventListener('aparte-conversation-loaded', onLoaded);
        chat.removeEventListener('aparte-reset-done', onLoaded);
        setRenderOptions(config, before);
    };
}

/** What the conversation's documents look like, to tell when one appeared or changed. */
function signature(panel: AparteArtifactPanel, fresh = false): string {
    if (fresh) panel.refresh();
    return panel.readDocuments().map((d) => `${d.id}:${d.versions.length}`).join(',');
}
