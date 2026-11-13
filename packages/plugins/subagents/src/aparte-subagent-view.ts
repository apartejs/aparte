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
    resolveConfig,
    runWithConfig,
    subscribeConfigChange,
    type AparteConfig,
    type AparteMessage,
    type AparteSegment,
} from '@aparte/core';
import { LaneDrawing } from './drawing.js';
import { watchLaneWrites, type LaneWrite } from './lanes.js';
import { subagentOf, subagentStatus } from './status.js';
import { ensureStyles } from './styles.js';

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

/** The segment that stands for `agentId` among `segments`, or in the lanes of the sub-agents there. */
export function findSubagent(segments: readonly AparteSegment[], agentId: string, depth = 0): AparteSegment | undefined {
    for (const segment of segments) {
        const sub = subagentOf(segment);
        if (!sub) continue;
        if (sub.id === agentId) return segment;
        if (depth >= MAX_DEPTH) continue;
        const found = findSubagent(laneOf(segment).segments, agentId, depth + 1);
        if (found) return found;
    }
    return undefined;
}

/** A view drawn under a line: the anchor it was handed, and the config of the row it is in. */
interface Fed {
    anchor: AparteSegment;
    config: AparteConfig;
    onRelease?: () => void;
}
const fed = new WeakMap<object, Fed>();

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
    static get observedAttributes(): string[] { return ['for', 'message-id', 'agent-id']; }

    private _chat: SubagentViewSource | null = null;
    private _task: HTMLElement | null = null;
    private _drawing: LaneDrawing | null = null;
    /** The config the rows were drawn with, and the segment they were drawn from. */
    private _config: AparteConfig | null = null;
    private _anchor: AparteSegment | null = null;
    private _listening: EventTarget | null = null;
    private _stopConfig: (() => void) | null = null;
    private _stopWatching: (() => void) | null = null;
    private _queued = false;
    private _releaseQueued = false;
    private _warned = '';

    private readonly _onConversation = (): void => this._schedule();
    private readonly _onWrite = (write: LaneWrite): void => {
        if (fed.has(this) || !this.isConnected) return;
        if (write.messageId !== this.getAttribute('message-id') || write.agentId !== this.getAttribute('agent-id')) return;
        if (!this._matches(write)) return;
        this._draw(write.anchor, this._sourceConfig());
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
        this._unlisten();
        this._stopWatching?.();
        this._stopWatching = null;
        this._stopConfig?.();
        this._stopConfig = null;
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
        const anchor = message ? findSubagent(message.segments ?? [], agentId) : undefined;
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
        if (this._config) this._drawing?.relabel(this._config);
    }

    // ── Drawing ────────────────────────────────────────────────────────────

    private _build(): void {
        if (this._drawing) {
            // Moved, or put back after a release: its two parts go back first.
            if (this._task!.parentNode !== this) this.prepend(this._task!);
            if (this._drawing.container.parentNode !== this) this.append(this._drawing.container);
            return;
        }
        const task = this.ownerDocument.createElement('p');
        task.className = 'aparte-subagent-task';
        task.hidden = true;
        const list = this.ownerDocument.createElement('div');
        list.className = 'aparte-subagent-transcript';
        this.append(task, list);
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
        const lane = anchor ? laneOf(anchor) : { segments: [], live: false };
        runWithConfig(config, () => drawing.sync(lane.segments, config, lane.live));
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
}
