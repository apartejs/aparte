/**
 * `<aparte-artifact-panel>` — a conversation's document, beside the conversation.
 *
 * The card in a reply shows a document where it was written. This element shows the same
 * document where the app puts it (a pane of `<aparte-split>`, a dialog, a drawer), with
 * its versions: it reads them from the conversation (`artifactDocuments`), draws the
 * current one with the card's own body, and follows the conversation as it changes.
 *
 * It holds no state of its own beyond which document and which version it shows, and it
 * decides nothing about the layout: opening and closing are the app's (see
 * `connectArtifactPanel` for the three lines that wire a card's Open button to it).
 *
 * Light DOM, like core. The element builds its own parts as children and never moves the
 * ones the app wrote, so a framework that owns those children keeps owning them.
 */
import {
    resolveConfig, runWithConfig, subscribeConfigChange,
    type AparteConfig, type AparteMessage,
} from '@aparte/core';
import { artifactCard } from '../card.js';
import { artifactDocuments, type ArtifactDocument, type ArtifactDocumentsOptions, type ArtifactVersion } from '../documents.js';
import { artifactSegment, type ArtifactSegment } from '../segment.js';
import { labelForKind } from '../shared.js';
import { conversationOf } from '../tool.js';
import artifactStyles from '../artifact.css?raw';
import panelStyles from './panel.css?raw';

/** Where the panel reads the conversation: a chat element, its viewport, or anything with `getMessages()`. */
export type ArtifactPanelSource = (Element | object) & { getMessages?: () => AparteMessage[] };

/**
 * Draw a version yourself. Return `false` to keep the built-in rendering for this one (so
 * one kind can be replaced without rewriting the others), `true` once you drew it, or a
 * function the panel calls before it draws something else.
 */
export type ArtifactPanelRender = (version: ArtifactVersion, container: HTMLElement) => boolean | (() => void);

/** `aparte-artifact-version-change`: what the panel shows changed, by the arrows, by `show()`, or because a document or a version arrived. */
export interface ArtifactVersionChangeEventDetail {
    documentId: string;
    /** 1, 2, 3… */
    version: number;
    /** How many versions the document has. */
    total: number;
}

/** What the conversation tells the panel it should read again. All bubble out of the chat. */
const CONVERSATION_EVENTS = [
    'aparte-artifact-change', 'aparte-segment-update', 'aparte-message-done', 'aparte-message-aborted',
    'aparte-message-error', 'aparte-path-changed', 'aparte-reset-done', 'aparte-conversation-loaded',
] as const;

/** Importable where there is no DOM: the class then extends nothing and is never defined. */
const ElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

let panelIdSeq = 0;

/**
 * The document of a conversation, with its versions, where the app places it.
 *
 * @element aparte-artifact-panel
 *
 * @attr {string} for - The `id` of the chat whose documents are shown: `<aparte-chat>`, its viewport, or any element with `getMessages()`. Or set the `chat` property.
 * @attr {string} document-id - Which document. Absent: the one the conversation touched last.
 * @attr {number} version - Which version, from 1. Absent: the latest, and the panel follows new ones.
 * @attr {string} label - The panel's accessible name while it shows no title of its own.
 * @attr {boolean} data-empty - Written BY the element while there is no document to show: it then draws nothing. Read-only; style or fold your layout against it.
 *
 * @fires {CustomEvent} aparte-artifact-panel-close - The Close button, or Escape inside the panel. The panel does not hide itself: the app owns the layout. Bubbles.
 * @fires {CustomEvent<ArtifactVersionChangeEventDetail>} aparte-artifact-version-change - What the panel shows changed, the first document it shows included: `{ documentId, version, total }`. Bubbles.
 *
 * @slot actions - Your own buttons (Export, Share), in the header before Close: one child with `slot="actions"`. It is left where you wrote it.
 *
 * @cssprop [--aparte-artifact-panel-measure=72ch] - The line length of a Markdown document shown for reading.
 *
 * @example The chat in one pane, its document in the other
 * ```html
 * <aparte-split primary="start" position="40" single>
 *   <aparte-chat id="chat">…</aparte-chat>
 *   <aparte-artifact-panel for="chat"></aparte-artifact-panel>
 * </aparte-split>
 * <script type="module">
 *   import { setupArtifacts } from '@aparte/plugin-artifacts';
 *   import { connectArtifactPanel } from '@aparte/plugin-artifacts/panel';
 *
 *   setupArtifacts();
 *   // The card's Open button shows the document in the panel and opens the pane; Close folds it.
 *   connectArtifactPanel({
 *     chat: document.querySelector('aparte-chat'),
 *     panel: document.querySelector('aparte-artifact-panel'),
 *     split: document.querySelector('aparte-split'),
 *   });
 * </script>
 * ```
 */
export class AparteArtifactPanel extends ElementBase {
    static get observedAttributes(): string[] { return ['for', 'document-id', 'version', 'label']; }

    private _chat: ArtifactPanelSource | null = null;
    private _documents: readonly ArtifactDocument[] | null = null;
    private _read: ArtifactDocumentsOptions['read'];
    private _tools: readonly string[] | undefined;
    private _render: ArtifactPanelRender | null = null;

    private _title: HTMLElement | null = null;
    private _versions: HTMLElement | null = null;
    private _count: HTMLElement | null = null;
    private _prev: HTMLButtonElement | null = null;
    private _next: HTMLButtonElement | null = null;
    private _close: HTMLButtonElement | null = null;
    private _body: HTMLElement | null = null;

    /** What the body shows now, to tell an update of it from another version. */
    private _shown: { key: string; card: HTMLElement | null; cleanup: (() => void) | null } | null = null;
    private _announced: string | null = null;
    private _listening: EventTarget | null = null;
    private _stopConfig: (() => void) | null = null;
    private _queued = false;

    private readonly _onConversation = (): void => this._schedule();
    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        this._emitClose();
    };

    // ── What the app sets ──────────────────────────────────────────────────

    /** The chat whose documents are shown, when it has no `id` for the `for` attribute: an element, or anything with `getMessages()`. */
    get chat(): ArtifactPanelSource | null { return this._chat; }
    set chat(value: ArtifactPanelSource | null) {
        this._chat = value;
        this._listen();
        this.refresh();
    }

    /**
     * The documents to show, when they are not read from a conversation: an app that keeps
     * its documents in its own store gives them here. `null` goes back to the conversation.
     */
    get documents(): readonly ArtifactDocument[] | null { return this._documents; }
    set documents(value: readonly ArtifactDocument[] | null) {
        this._documents = value;
        this.refresh();
    }

    /** Passed to `artifactDocuments`: read a document out of a segment the plugin does not know (an agent's own tool). */
    get read(): ArtifactDocumentsOptions['read'] { return this._read; }
    set read(value: ArtifactDocumentsOptions['read']) {
        this._read = value;
        this.refresh();
    }

    /** Passed to `artifactDocuments`: the names of the plugin's tools, when the app renamed them. */
    get tools(): readonly string[] | undefined { return this._tools; }
    set tools(value: readonly string[] | undefined) {
        this._tools = value;
        this.refresh();
    }

    /** Draw a version yourself: see {@link ArtifactPanelRender}. `null` goes back to the built-in rendering. */
    get render(): ArtifactPanelRender | null { return this._render; }
    set render(value: ArtifactPanelRender | null) {
        this._render = value;
        this._clearBody();
        this.refresh();
    }

    /** The document shown, or `null` while the panel is empty. */
    get shownDocument(): ArtifactDocument | null { return this._current()?.document ?? null; }

    /** Every document the panel can show now, the one the conversation touched last coming last. */
    readDocuments(): readonly ArtifactDocument[] { return this._documentsNow(); }

    /** The version shown, or `null` while the panel is empty. */
    get shownVersion(): ArtifactVersion | null { return this._current()?.version ?? null; }

    /**
     * Show a document: its latest version, a version by number, or the version a card in
     * the conversation draws (`segmentId`, as `aparte-artifact-open` gives it).
     */
    show(documentId: string, options: { version?: number; segmentId?: string } = {}): void {
        const document = this._documentsNow().find((d) => d.id === documentId);
        const bySegment = options.segmentId ? document?.versions.find((v) => v.segmentId === options.segmentId)?.index : undefined;
        const index = options.version ?? bySegment;
        this.setAttribute('document-id', documentId);
        // The latest is "no version": the panel then follows the versions that arrive.
        if (index === undefined || !document || index >= document.versions.length) this.removeAttribute('version');
        else this.setAttribute('version', String(index));
        this.refresh();
    }

    /** Move focus to the panel's title: what a caller does after opening the panel. */
    focusTitle(): void { this._title?.focus(); }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    connectedCallback(): void {
        ensureStyles();
        this._build();
        this._listen();
        this.addEventListener('keydown', this._onKeydown);
        this._stopConfig = subscribeConfigChange(this, () => this._schedule());
        this.refresh();
    }

    disconnectedCallback(): void {
        this._unlisten();
        this.removeEventListener('keydown', this._onKeydown);
        this._stopConfig?.();
        this._stopConfig = null;
        this._clearBody();
    }

    attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
        if (previous === value || !this.isConnected) return;
        if (name === 'for') this._listen();
        this.refresh();
    }

    // ── Reading the conversation ───────────────────────────────────────────

    private _source(): ArtifactPanelSource | null {
        if (this._chat) return this._chat;
        const id = this.getAttribute('for');
        return id ? this.ownerDocument.getElementById(id) : null;
    }

    private _config(): AparteConfig {
        const source = this._source();
        return resolveConfig(typeof Element !== 'undefined' && source instanceof Element ? source : this);
    }

    /** The documents: the app's, else the conversation's, the one touched last coming last. */
    private _documentsNow(): readonly ArtifactDocument[] {
        if (this._documents) return this._documents;
        const source = this._source();
        const messages = source ? conversationOf({ target: source as HTMLElement }) : undefined;
        if (!messages) return [];
        const documents = artifactDocuments(messages, { read: this._read, tools: this._tools });
        // The one the conversation touched last comes last: that is the default document.
        const position = new Map(messages.map((m, i) => [m.id, i]));
        return [...documents].sort((a, b) => (position.get(a.latest.messageId) ?? 0) - (position.get(b.latest.messageId) ?? 0));
    }

    private _current(): { document: ArtifactDocument; version: ArtifactVersion } | null {
        const documents = this._documentsNow();
        const wanted = this.getAttribute('document-id');
        const document = wanted ? documents.find((d) => d.id === wanted) : documents.at(-1);
        if (!document) return null;
        const asked = Number(this.getAttribute('version'));
        const version = Number.isInteger(asked) && asked >= 1 && asked <= document.versions.length
            ? document.versions[asked - 1]!
            : document.latest;
        return { document, version };
    }

    private _listen(): void {
        const source = this._source();
        const target = source && typeof (source as EventTarget).addEventListener === 'function' ? source as EventTarget : null;
        if (target === this._listening) return;
        this._unlisten();
        if (!target || !this.isConnected) return;
        for (const name of CONVERSATION_EVENTS) target.addEventListener(name, this._onConversation);
        this._listening = target;
    }

    private _unlisten(): void {
        if (!this._listening) return;
        for (const name of CONVERSATION_EVENTS) this._listening.removeEventListener(name, this._onConversation);
        this._listening = null;
    }

    /** One reading per frame, however many chunks arrived in it. */
    private _schedule(): void {
        if (this._queued) return;
        this._queued = true;
        const run = (): void => {
            this._queued = false;
            if (this.isConnected) this.refresh();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    // ── Drawing ────────────────────────────────────────────────────────────

    /** The panel's own parts, built once around whatever the app wrote inside. */
    private _build(): void {
        if (this._body) return;
        const id = `aparte-art-panel-${++panelIdSeq}`;
        const part = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
            const element = this.ownerDocument.createElement(tag);
            element.className = className;
            return element;
        };

        this._title = part('h2', 'aparte-art-panel__title');
        this._title.id = `${id}-title`;
        this._title.tabIndex = -1;

        this._versions = part('div', 'aparte-art-panel__versions');
        this._versions.setAttribute('role', 'group');
        this._versions.hidden = true;
        this._prev = part('button', 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-art-panel__version');
        this._next = part('button', 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-art-panel__version');
        this._count = part('span', 'aparte-art-panel__count');
        for (const button of [this._prev, this._next]) button.type = 'button';
        this._prev.addEventListener('click', () => this._step(-1));
        this._next.addEventListener('click', () => this._step(1));
        this._versions.append(this._prev, this._count, this._next);

        this._close = part('button', 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-art-panel__close');
        this._close.type = 'button';
        this._close.addEventListener('click', () => this._emitClose());

        this._body = part('div', 'aparte-art-panel__body');

        // Around the app's children, never through them: the title and the versions first,
        // Close and the body last. The grid places each (panel.css).
        this.prepend(this._title, this._versions);
        this.append(this._close, this._body);
        this.setAttribute('role', 'region');
    }

    /** Read the conversation again and draw what it says. Called on its own as the conversation changes. */
    refresh(): void {
        if (!this._body || !this._title) return;
        const config = this._config();
        const current = this._current();
        this.toggleAttribute('data-empty', !current);
        this._label(config, current);
        if (!current) {
            this._clearBody();
            this._announced = null;
            return;
        }
        const { document, version } = current;
        const total = document.versions.length;

        this._versions!.hidden = total < 2;
        this._count!.textContent = `${version.index} / ${total}`;
        this._prev!.disabled = version.index <= 1;
        this._next!.disabled = version.index >= total;

        runWithConfig(config, () => this._draw(document, version));

        const announced = `${document.id}\u0000${version.index}\u0000${total}`;
        // The first document shown is announced too: an app hangs its own header details on it.
        if (this._announced !== announced) {
            this.dispatchEvent(new CustomEvent<ArtifactVersionChangeEventDetail>('aparte-artifact-version-change', {
                bubbles: true, composed: true, detail: { documentId: document.id, version: version.index, total },
            }));
        }
        this._announced = announced;
    }

    /** The strings: in the chat's locale, written again each time since a locale can change. */
    private _label(config: AparteConfig, current: { document: ArtifactDocument; version: ArtifactVersion } | null): void {
        const title = current ? (current.document.title ?? current.version.title ?? labelForKind(current.version.artifactType)) : '';
        this._title!.textContent = title;
        if (title) {
            this.setAttribute('aria-labelledby', this._title!.id);
            this.removeAttribute('aria-label');
        } else {
            this.removeAttribute('aria-labelledby');
            const label = this.getAttribute('label');
            if (label) this.setAttribute('aria-label', label);
            else this.removeAttribute('aria-label');
        }
        const name = (button: HTMLButtonElement, text: string, icon: string): void => {
            button.title = text;
            button.setAttribute('aria-label', text);
            // An icon from the chat's icon provider: static SVG the app or core supplied.
            button.innerHTML = config.getIcon(icon as never);
        };
        name(this._prev!, config.t('previousVersion'), 'prevBranch');
        name(this._next!, config.t('nextVersion'), 'nextBranch');
        name(this._close!, config.t('closeArtifact'), 'close');
        if (current) {
            const spoken = config.t('artifactVersion')
                .replace('{n}', () => String(current.version.index))
                .replace('{total}', () => String(current.document.versions.length));
            this._versions!.setAttribute('aria-label', spoken);
        }
    }

    private _draw(document: ArtifactDocument, version: ArtifactVersion): void {
        const body = this._body!;
        const key = `${document.id}\u0000${version.segmentId ?? version.index}`;
        const segment: ArtifactSegment = {
            ...artifactSegment(version.segmentId ?? `${document.id}-v${version.index}`, {
                documentId: document.id,
                mimeType: version.mimeType,
                title: document.title ?? version.title,
                content: version.content,
            }),
            isStreaming: version.streaming === true,
        };

        // The same version, already drawn by the card: it takes the update, and keeps the
        // tab somebody chose and the preview somebody opened.
        if (this._shown?.key === key && this._shown.card) {
            artifactCard.update(this._shown.card, segment);
            return;
        }
        this._clearBody();

        const drawn = this._render ? this._render(version, body) : false;
        if (drawn !== false) {
            this._shown = { key, card: null, cleanup: typeof drawn === 'function' ? drawn : null };
            return;
        }
        // Handed back: whatever the app started to write goes, the card draws.
        body.replaceChildren();

        // The card's own markup (escaped and sanitised where it is built), drawn as the body.
        const template = this.ownerDocument.createElement('template');
        template.innerHTML = artifactCard.render(segment, { surface: 'panel' }).trim();
        const card = template.content.firstElementChild as HTMLElement | null;
        if (!card) return;
        body.append(card);
        // The card with tabs lends its tabs and its buttons to the panel's header (panel.css).
        const tabbed = card.querySelector('[role="tablist"]') !== null;
        body.classList.toggle('aparte-art-panel__body--card', tabbed);
        artifactCard.setup(card, segment, { surface: 'panel' });
        this._shown = { key, card, cleanup: null };
    }

    private _clearBody(): void {
        this._shown?.cleanup?.();
        this._shown = null;
        this._body?.classList.remove('aparte-art-panel__body--card');
        this._body?.replaceChildren();
    }

    // ── What the reader does ───────────────────────────────────────────────

    private _step(by: number): void {
        const current = this._current();
        if (!current) return;
        const total = current.document.versions.length;
        const index = Math.min(total, Math.max(1, current.version.index + by));
        // Pin the document being read: a new document elsewhere must not take its place.
        this.setAttribute('document-id', current.document.id);
        // Back on the latest: no version, so the next one that arrives is followed.
        if (index >= total) this.removeAttribute('version');
        else this.setAttribute('version', String(index));
        this.refresh();
    }

    private _emitClose(): void {
        this.dispatchEvent(new CustomEvent('aparte-artifact-panel-close', { bubbles: true, composed: true }));
    }
}

/** The panel's sheet, and the card's when no card has put it on the page yet. Once per document. */
function ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById('aparte-artifact-panel-styles')) return;
    const cardStyled = [...document.querySelectorAll('style')].some((sheet) => sheet.textContent?.includes('.aparte-art-card__pane'));
    const style = document.createElement('style');
    style.id = 'aparte-artifact-panel-styles';
    style.textContent = cardStyled ? panelStyles : `${artifactStyles}\n${panelStyles}`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-artifact-panel')) {
    customElements.define('aparte-artifact-panel', AparteArtifactPanel);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-artifact-panel': AparteArtifactPanel;
    }
    interface HTMLElementEventMap {
        'aparte-artifact-panel-close': CustomEvent<void>;
        'aparte-artifact-version-change': CustomEvent<ArtifactVersionChangeEventDetail>;
    }
}
