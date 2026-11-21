/**
 * `<aparte-subagent-view>` — a sub-agent's conversation, wherever the app puts it.
 *
 * The line in the reply says what a sub-agent is doing; this element shows what it said and
 * did — its text, its reasoning, its tool rows, its own sub-agents as lines — drawn by the
 * same renderers as the reply. It is also what `subagentTranscript` puts under the line, so
 * there is one drawing of a conversation, not two.
 *
 * Standalone, it reads the sub-agent from the chat: live, from each write of the plugin's
 * lane (once a frame while it streams); saved, from the segment that stands for it in the
 * reply, searched through the lanes of its parents too. A saved conversation is adopted
 * before it is drawn (`createSegmentList`), so nothing in it reads as still arriving.
 *
 * Light DOM, like core. It writes its own two parts as children and decides nothing about
 * the layout.
 */
import {
    createSegmentList,
    deferHydrationOf,
    onRenderersChange,
    resolveConfig,
    runWithConfig,
    subscribeConfigChange,
    type AparteConfig,
    type AparteLinkClickEventDetail,
    type AparteMessage,
    type AparteSegment,
} from '@aparte/core';
import { LaneDrawing } from './drawing.js';
import { lastLaneWrite, watchLaneWrites, type LaneWrite } from './lanes.js';
import { currentLine } from './open.js';
import { subagentOf, subagentStatus } from './status.js';
import { ensureStyles } from './styles.js';
import type { AparteSubagent } from './types.js';
import { word } from './words.js';

/** Where the view reads the conversation: a chat element, its viewport, or anything with `getMessages()`. */
export type SubagentViewSource = (Element | object) & {
    getMessages?: () => AparteMessage[];
    getMessage?: (id: string) => AparteMessage | undefined;
};

/** What the chat says that may change what a standalone view shows. All bubble out of the chat. */
const CONVERSATION_EVENTS = [
    'aparte-subagent-start', 'aparte-subagent-end', 'aparte-segment-update', 'aparte-message-done',
    'aparte-message-aborted', 'aparte-message-error', 'aparte-message-paused', 'aparte-path-changed',
    'aparte-reset-done', 'aparte-conversation-loaded',
] as const;

/** How deep the search for a sub-agent of a sub-agent goes. */
const MAX_DEPTH = 16;

/** A saved conversation, adopted once per list: settled, so nothing in it reads as arriving. */
const adopted = new WeakMap<readonly AparteSegment[], readonly AparteSegment[]>();

/**
 * The conversation of the sub-agent `anchor` stands for, as it is drawn: as it is while the
 * sub-agent works, adopted once it is over (a reload, a Stop, its end) — every text settled,
 * every call still open read as stopped.
 */
export function laneOf(anchor: AparteSegment): { segments: readonly AparteSegment[]; live: boolean } {
    const sub = subagentOf(anchor);
    if (!sub) return { segments: [], live: false };
    const status = subagentStatus(anchor);
    if (status === 'running' || status === 'waiting') return { segments: sub.segments, live: true };
    let settled = adopted.get(sub.segments);
    if (!settled) {
        settled = createSegmentList({ messageId: anchor.messageId ?? '', segments: sub.segments }).segments;
        adopted.set(sub.segments, settled);
    }
    return { segments: settled, live: false };
}

/**
 * The segment that stands for `agentId` among `segments`, or in the lanes of the sub-agents
 * there. With `toolCallId`, the one on that call first: two sub-agents of one reply can share an
 * id (a backend minting ids per run), and the first match was then always the first of them.
 */
export function findSubagent(segments: readonly AparteSegment[], agentId: string, depth = 0, toolCallId?: string): AparteSegment | undefined {
    if (toolCallId !== undefined) {
        // A call's id, or `own:` the id of a line of its own (see `lineKeyOf`).
        const anchorId = toolCallId.startsWith('own:') ? toolCallId.slice(4) : `tool-${toolCallId}`;
        const onLine = findSubagentWhere(segments, (s, sub) => sub.id === agentId && s.id === anchorId, depth);
        if (onLine) return onLine;
    }
    return findSubagentWhere(segments, (_s, sub) => sub.id === agentId, depth);
}

function findSubagentWhere(segments: readonly AparteSegment[], match: (segment: AparteSegment, sub: AparteSubagent) => boolean, depth: number): AparteSegment | undefined {
    for (const segment of segments) {
        const sub = subagentOf(segment);
        if (!sub) continue;
        if (match(segment, sub)) return segment;
        if (depth >= MAX_DEPTH) continue;
        const found = findSubagentWhere(laneOf(segment).segments, match, depth + 1);
        if (found) return found;
    }
    return undefined;
}

/**
 * The view of its own drawing its rows now, or `null` for the chat. A nested sub-agent's line is
 * drawn in the chat (inside its parent's transcript) and in a view of the parent beside it: the
 * transcript keeps one conversation element per surface, or the one element moved back and forth
 * between the two rows on every update. A view under a line draws on the surface around it.
 */
let drawingSurface: Element | null = null;
export const currentSurface = (): Element | null => drawingSurface;

/**
 * The call a view's sub-agent was opened from, by view: set by `connectSubagentView` from the
 * line pressed. Kept inside the plugin: an app wiring a view itself names the sub-agent by its
 * id, as before.
 */
const viewCalls = new WeakMap<Element, string>();

/** Point `view` at the sub-agent on `toolCallId` (or at the first under its id, with none), and draw it again. */
export function setViewCall(view: Element, toolCallId: string | undefined): void {
    if (viewCalls.get(view) === toolCallId) return;
    if (toolCallId === undefined) viewCalls.delete(view);
    else viewCalls.set(view, toolCallId);
    (view as { refresh?: () => void }).refresh?.();
}

/** A view drawn under a line: the anchor it was handed, and the config of the row it is in. */
interface Fed {
    anchor: AparteSegment;
    config: AparteConfig;
    onRelease?: () => void;
}
const fed = new WeakMap<object, Fed>();

/** The view of its own a line's detail sits in, at any depth, or `null` when it sits in the chat. */
function standingViewAround(view: Element): Element | null {
    let up = view.parentElement?.closest('aparte-subagent-view') ?? null;
    while (up && fed.has(up)) up = up.parentElement?.closest('aparte-subagent-view') ?? null;
    return up;
}

/** Importable where there is no DOM: the class then extends nothing and is never defined. */
const ElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

/**
 * A sub-agent's conversation — its text, its reasoning, its tool rows, its own sub-agents as
 * lines — where the app places it: a canvas, a pane of `<aparte-split>`, a dialog. It follows
 * the sub-agent live while it works and shows the saved conversation after a reload. Name the
 * chat with `for` (or the `chat` property), the reply with `message-id`, the sub-agent with
 * `agent-id`: `aparte-subagent-start` gives all three as its sub-agents start.
 *
 * It is the same element `subagentTranscript` puts under a sub-agent's line.
 *
 * @element aparte-subagent-view
 *
 * @attr {string} for - The `id` of the chat: `<aparte-chat>`, its viewport, or any element with `getMessages()`. Or set the `chat` property.
 * @attr {string} message-id - The reply the sub-agent worked for (`aparte-subagent-start`'s `messageId`).
 * @attr {string} agent-id - Which sub-agent (`aparte-subagent-start`'s `agentId`).
 * @attr {boolean} data-empty - Written BY the element while there is nothing to show (an unknown sub-agent, or one not started yet): it then draws nothing. Read-only; style or fold your layout against it.
 * @attr {boolean} data-inline - Written BY the element when it is a line's detail rather than a view of its own. Read-only.
 * @attr {boolean} closable - A pane of its own: the sub-agent's name and a Close button above its conversation, and Escape inside it closes too. Both only say so (`aparte-subagent-view-close`): the app, or `connectSubagentView`, folds the pane.
 *
 * @fires {CustomEvent} aparte-subagent-view-close - The Close button, or Escape inside a `closable` view. The view does not hide itself: the app owns the layout. Bubbles.
 * @fires {CustomEvent<AparteLinkClickEventDetail>} aparte-link-click - A link the sub-agent wrote is about to be followed. Sent on the chat (`for` or `chat`; the view itself when it names none), as a message sends its own, so the listener that routes a reply's links routes these. Cancelable: `preventDefault()` keeps the browser from navigating. Under a line, inside the reply, the message sends it.
 *
 * @cssprop [--aparte-subagent-indent=var(--aparte-space-6)] - The space between the rule down the leading edge and the conversation, in a standalone view.
 *
 * @example The chat in one pane, a sub-agent's conversation in the other
 * ```html
 * <aparte-split primary="start" position="55" single>
 *   <aparte-chat id="chat">…</aparte-chat>
 *   <aparte-subagent-view for="chat"></aparte-subagent-view>
 * </aparte-split>
 * <script type="module">
 *   import { setupSubagents } from '@aparte/plugin-subagents';
 *
 *   setupSubagents();
 *   const view = document.querySelector('aparte-subagent-view');
 *   // Show the latest sub-agent to start, as it works.
 *   document.getElementById('chat').addEventListener('aparte-subagent-start', (e) => {
 *     view.setAttribute('message-id', e.detail.messageId);
 *     view.setAttribute('agent-id', e.detail.agentId);
 *   });
 * </script>
 * ```
 */
export class AparteSubagentView extends ElementBase {
    static get observedAttributes(): string[] { return ['for', 'message-id', 'agent-id', 'closable']; }

    private _chat: SubagentViewSource | null = null;
    private _task: HTMLElement | null = null;
    /** A closable view's head: the sub-agent's name and Close. */
    private _head: HTMLElement | null = null;
    private _name: HTMLElement | null = null;
    private _close: HTMLButtonElement | null = null;
    private _drawing: LaneDrawing | null = null;
    /** The config the rows were drawn with, and the segment they were drawn from. */
    private _config: AparteConfig | null = null;
    private _anchor: AparteSegment | null = null;
    private _listening: EventTarget | null = null;
    private _stopConfig: (() => void) | null = null;
    private _stopWatching: (() => void) | null = null;
    private _stopRenderers: (() => void) | null = null;
    private _queued = false;
    private _releaseQueued = false;
    private _warned = '';

    private readonly _onConversation = (): void => this._schedule();
    private readonly _onKeydown = (event: KeyboardEvent): void => {
        // An IME's Escape cancels a candidate in a field inside (a diff comment): the field's.
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || !this._closable()) return;
        event.preventDefault();
        this._emitClose();
    };
    /** A renderer registered or taken off on the config the rows were drawn with: the rows it changes are drawn again. */
    private readonly _onRenderers = (config: AparteConfig): void => {
        if (config === this._config) this.refresh();
    };
    private readonly _onWrite = (write: LaneWrite): void => {
        if (fed.has(this) || !this.isConnected) return;
        if (write.messageId !== this.getAttribute('message-id') || write.agentId !== this.getAttribute('agent-id')) return;
        if (!this._matches(write) || !this._onItsCall(write.anchor)) return;
        this._draw(write.anchor, this._sourceConfig());
    };
    /**
     * A link the sub-agent wrote is a link of the conversation, and beside the chat no message
     * hears a click on it: the view announces it on its chat, as a message announces its own,
     * so the app's one listener there routes it — a same-site link followed in place replaces
     * the page. Under a line, or anywhere else inside a message, the view is in the reply and the
     * message announces it.
     */
    private readonly _onClick = (event: MouseEvent): void => {
        if (fed.has(this) || this.closest('aparte-chat-bubble')) return;
        const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!anchor || !this.contains(anchor)) return;
        const detail: AparteLinkClickEventDetail = { href: anchor.getAttribute('href') ?? '', anchor, messageId: this.getAttribute('message-id') };
        if (!this._announce(detail)) event.preventDefault();
    };
    /**
     * An announcement made inside the view — a source's link, which core says on the chip it
     * stands for — goes on to the chat too, unless the chat is around the view already.
     */
    private readonly _onInnerLinkClick = (event: Event): void => {
        if (fed.has(this) || event.target === this) return;
        const chat = this._chatTarget();
        if (chat === this || (typeof Node !== 'undefined' && chat instanceof Node && chat.contains(this))) return;
        event.stopPropagation();
        if (!this._announce((event as CustomEvent<AparteLinkClickEventDetail>).detail)) event.preventDefault();
    };

    // ── What the app sets ──────────────────────────────────────────────────

    /** The chat, when it has no `id` for the `for` attribute: an element, or anything with `getMessages()`. */
    get chat(): SubagentViewSource | null { return this._chat; }
    set chat(value: SubagentViewSource | null) {
        this._chat = value;
        if (!this.isConnected) return;
        this._listen();
        this.refresh();
    }

    /** Put the focus on the sub-agent's name, in a `closable` view: where a pane that just opened starts. */
    focusTitle(): void {
        if (this._name && !this._head?.hidden) this._name.focus();
    }

    /** Read the sub-agent again and draw it: what the element does on every change it hears. */
    refresh(): void {
        const feed = fed.get(this);
        if (!feed && !this.isConnected) return;
        const anchor = feed ? feed.anchor : this._find();
        // A chat that cannot be read keeps what its last write showed.
        this._draw(anchor === null ? this._anchor : anchor, feed ? feed.config : this._sourceConfig());
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    connectedCallback(): void {
        ensureStyles();
        this._build();
        this.addEventListener('keydown', this._onKeydown);
        this.addEventListener('click', this._onClick);
        this.addEventListener('aparte-link-click', this._onInnerLinkClick);
        this._stopRenderers ??= onRenderersChange(this._onRenderers);
        if (!fed.has(this)) {
            this._listen();
            this._stopWatching ??= watchLaneWrites(this._onWrite);
        } else {
            this._stopConfig?.();
            this._stopConfig = subscribeConfigChange(this, () => this._onConfigChange());
        }
        this.refresh();
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this._onKeydown);
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('aparte-link-click', this._onInnerLinkClick);
        this._unlisten();
        this._stopWatching?.();
        this._stopWatching = null;
        this._stopConfig?.();
        this._stopConfig = null;
        this._stopRenderers?.();
        this._stopRenderers = null;
        // Gone for good, or only moved (a row rebuilt around it, a fold taking its row)?
        // Decided once the move is over.
        if (this._releaseQueued) return;
        this._releaseQueued = true;
        queueMicrotask(() => {
            this._releaseQueued = false;
            if (this.isConnected) return;
            this._release();
        });
    }

    attributeChangedCallback(_name: string, previous: string | null, value: string | null): void {
        if (previous === value || !this.isConnected || fed.has(this)) return;
        if (_name === 'for') this._listen();
        this.refresh();
        // Shown or taken away, its words in place: a closable view's head.
        if (_name === 'closable' && this._config) this._relabelHead(this._config);
    }

    // ── Reading the conversation ───────────────────────────────────────────

    private _source(): SubagentViewSource | null {
        if (this._chat) return this._chat;
        const id = this.getAttribute('for');
        return id ? this.ownerDocument.getElementById(id) : null;
    }

    private _sourceConfig(): AparteConfig {
        const source = this._source();
        return resolveConfig(typeof Element !== 'undefined' && source instanceof Element ? source : this);
    }

    /** Where the chat hears what the view says: its element, or the one an app's handle names (`getElement()`), else the view. */
    private _chatTarget(): EventTarget {
        const source = this._source();
        if (typeof Element !== 'undefined' && source instanceof Element) return source;
        const named = (source as { getElement?: () => Element | null } | null)?.getElement?.();
        return named ?? this;
    }

    /** Say on the chat that a link is about to be followed: `false` when a listener cancelled it. */
    private _announce(detail: AparteLinkClickEventDetail): boolean {
        return this._chatTarget().dispatchEvent(new CustomEvent<AparteLinkClickEventDetail>('aparte-link-click', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail,
        }));
    }

    /**
     * An anchor of the sub-agent this view was opened on: any, when it was opened by id alone;
     * the one on its call, when the line pressed named one. Another sub-agent under the same id
     * (a backend minting ids per run) writes too, and was drawn over the one opened.
     */
    private _onItsCall(anchor: AparteSegment): boolean {
        // The line it was opened on, or the call that line moved onto since.
        const line = currentLine(this.getAttribute('message-id'), viewCalls.get(this));
        if (line === undefined) return true;
        // A line of its own, named as such (`own:` its id): that line only.
        if (line.startsWith('own:')) return anchor.id === line.slice(4);
        return anchor.type !== 'tool_call' || anchor.id === `tool-${line}`;
    }

    /** A write from this view's chat: the run's target is the chat, inside it, or named by its id. */
    private _matches(write: LaneWrite): boolean {
        const source = this._source();
        if (!source) return false;
        if (source === write.target) return true;
        if (typeof Node !== 'undefined' && source instanceof Node && write.target instanceof Node
            && (source.contains(write.target) || write.target.contains(source))) return true;
        return write.targetId !== undefined && (source as { id?: unknown }).id === write.targetId;
    }

    /**
     * The segment that stands for the sub-agent in the chat's reply; `undefined` when there is
     * none, `null` when the chat cannot be read at all.
     */
    private _find(): AparteSegment | undefined | null {
        const messageId = this.getAttribute('message-id');
        const agentId = this.getAttribute('agent-id');
        const source = this._source();
        if (!messageId || !agentId || !source) return undefined;
        type Reader = SubagentViewSource & { querySelector?: (selector: string) => SubagentViewSource | null };
        const own = source as Reader;
        const reader = typeof own.getMessage === 'function' || typeof own.getMessages === 'function'
            ? own
            : own.querySelector?.('aparte-chat-viewport') ?? null;
        if (!reader || (typeof reader.getMessage !== 'function' && typeof reader.getMessages !== 'function')) return null;
        let message: AparteMessage | undefined;
        try {
            message = reader.getMessage?.(messageId) ?? reader.getMessages?.()?.find((m) => m.id === messageId);
        } catch {
            return null;
        }
        // A run still going may have written the lane before the chat a framework mirrors
        // holds it: the last write, then, as the next one would bring it.
        const live = lastLaneWrite(messageId, agentId);
        const anchor = (message ? findSubagent(message.segments ?? [], agentId, 0, currentLine(messageId, viewCalls.get(this))) : undefined)
            ?? (live && this._matches(live) && this._onItsCall(live.anchor) ? live.anchor : undefined);
        // Said once, for the developer: a finished reply that holds no such sub-agent. A reply
        // still being written may hold it soon, and a missing reply may arrive.
        const key = `${messageId}\u0000${agentId}`;
        if (message && !anchor && !message.isStreaming && message.status !== 'pending' && message.status !== 'streaming' && this._warned !== key) {
            this._warned = key;
            console.warn(`[aparte] <aparte-subagent-view>: the reply "${messageId}" holds no sub-agent "${agentId}".`);
        }
        return anchor;
    }

    private _listen(): void {
        const source = this._source();
        const target = source && typeof (source as EventTarget).addEventListener === 'function' ? source as EventTarget : null;
        if (target !== this._listening) {
            this._unlisten();
            if (target) for (const name of CONVERSATION_EVENTS) target.addEventListener(name, this._onConversation);
            this._listening = target;
        }
        // The chat's config, not this element's: a language switch on the chat's own config
        // names the chat's config, which this element would not resolve to outside it.
        this._stopConfig?.();
        const holder = typeof Element !== 'undefined' && source instanceof Element ? source : this;
        this._stopConfig = subscribeConfigChange(holder, () => this._onConfigChange());
    }

    private _unlisten(): void {
        if (this._listening) for (const name of CONVERSATION_EVENTS) this._listening.removeEventListener(name, this._onConversation);
        this._listening = null;
    }

    /** Folds a burst of events (a whole run's end) into one read. */
    private _schedule(): void {
        if (this._queued) return;
        this._queued = true;
        queueMicrotask(() => {
            this._queued = false;
            this.refresh();
        });
    }

    private _onConfigChange(): void {
        this.refresh();
        const config = this._config;
        if (config) {
            this._onSurface(() => this._drawing?.relabel(config));
            this._relabelHead(config);
        }
    }

    /** A pane of its own, never a line's detail. */
    private _closable(): boolean {
        return this.hasAttribute('closable') && !fed.has(this);
    }

    private _emitClose(): void {
        this.dispatchEvent(new CustomEvent('aparte-subagent-view-close', { bubbles: true, composed: true }));
    }

    /** The head's words, in the chat's language: the name, and Close. */
    private _relabelHead(config: AparteConfig): void {
        if (!this._head) return;
        const closable = this._closable();
        this._head.hidden = !closable;
        // Nothing in a head that is not shown: the view's text is its conversation's.
        if (!closable) {
            this._name!.textContent = '';
            return;
        }
        const name = (this._anchor ? subagentOf(this._anchor)?.name?.trim() : '') || word(config, 'subagentsUnnamed');
        if (this._name!.textContent !== name) this._name!.textContent = name;
        const close = word(config, 'subagentsClose');
        if (this._close!.getAttribute('aria-label') !== close) {
            this._close!.setAttribute('aria-label', close);
            this._close!.title = close;
            // The chat's icon provider: static SVG the app or core supplied.
            this._close!.innerHTML = config.getIcon('close');
        }
    }

    // ── Drawing ────────────────────────────────────────────────────────────

    private _build(): void {
        if (this._drawing) {
            // Moved, or put back after a release: its parts go back first.
            if (this._task!.parentNode !== this) this.prepend(this._task!);
            if (this._head!.parentNode !== this) this.prepend(this._head!);
            if (this._drawing.container.parentNode !== this) this.append(this._drawing.container);
            return;
        }
        // The head of a closable view: hidden until the attribute says so.
        const head = this.ownerDocument.createElement('div');
        head.className = 'aparte-subagent-head';
        head.hidden = true;
        const name = this.ownerDocument.createElement('h2');
        name.className = 'aparte-subagent-name';
        name.tabIndex = -1;
        const close = this.ownerDocument.createElement('button');
        close.type = 'button';
        close.className = 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-subagent-close';
        close.addEventListener('click', () => this._emitClose());
        head.append(name, close);
        this._head = head;
        this._name = name;
        this._close = close;
        const task = this.ownerDocument.createElement('p');
        task.className = 'aparte-subagent-task';
        task.hidden = true;
        const list = this.ownerDocument.createElement('div');
        list.className = 'aparte-subagent-transcript';
        this.append(head, task, list);
        this._task = task;
        this._drawing = new LaneDrawing(list);
    }

    /** Draw `anchor`'s conversation with `config`. */
    private _draw(anchor: AparteSegment | null | undefined, config: AparteConfig): void {
        this._build();
        const drawing = this._drawing!;
        // Another config draws with other renderers: every row anew.
        if (this._config && this._config !== config) drawing.clear(this._config);
        this._config = config;
        this._anchor = anchor ?? null;
        this.toggleAttribute('data-inline', fed.has(this));
        this.toggleAttribute('data-empty', !anchor);
        const task = (anchor ? subagentOf(anchor)?.description?.trim() : '') ?? '';
        if (this._task!.textContent !== task) this._task!.textContent = task;
        this._task!.hidden = !task;
        this._relabelHead(config);
        const lane = anchor ? laneOf(anchor) : { segments: [], live: false };
        this._onSurface(() => runWithConfig(config, () => drawing.sync(lane.segments, config, lane.live)));
    }

    /** This view, as the surface its rows are drawn on (see `currentSurface`). */
    private ownSurface(): Element {
        return this;
    }

    /**
     * Run `fn` with this view's surface as the one its rows are drawn on (see `currentSurface`):
     * every pass over its rows, a draw or a relabel. A view of its own is its surface. A line's
     * detail is drawn on its line's surface: the one being drawn, or, when it is redrawn on its own,
     * the view of its own it sits in, else the chat. A relabel run outside the draw had no
     * surface: a nested row asked for the chat's element of a transcript, and moved it here.
     */
    private _onSurface(fn: () => void): void {
        const outer = drawingSurface;
        drawingSurface = !fed.has(this) ? this.ownSurface() : outer ?? standingViewAround(this);
        try {
            fn();
        } finally {
            drawingSurface = outer;
        }
    }

    /** Out of the page for good: every row's renderer cleans up, and the drawing goes. */
    private _release(): void {
        if (this._config) this._drawing?.clear(this._config);
        const feed = fed.get(this);
        if (feed) {
            fed.delete(this);
            feed.onRelease?.();
        }
    }
}

/**
 * Draw `anchor` in `view`, as a line's detail: the view then reads nothing of its own and
 * shows what each call hands it. `onRelease` runs when the view leaves the page for good.
 */
export function feedView(view: AparteSubagentView, anchor: AparteSegment, config: AparteConfig, onRelease?: () => void): void {
    const release = onRelease ?? fed.get(view)?.onRelease;
    fed.set(view, { anchor, config, ...(release ? { onRelease: release } : {}) });
    (view as unknown as { _draw(anchor: AparteSegment, config: AparteConfig): void })._draw(anchor, config);
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-subagent-view')) {
    // Before defining, like core's own elements: in a server-rendered page the tag waits for
    // the wrapper's release instead of drawing into the DOM the framework hydrates.
    deferHydrationOf(AparteSubagentView);
    customElements.define('aparte-subagent-view', AparteSubagentView);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-subagent-view': AparteSubagentView;
    }
    interface HTMLElementEventMap {
        'aparte-subagent-view-close': CustomEvent<void>;
    }
}
