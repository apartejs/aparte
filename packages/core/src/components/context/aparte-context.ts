import { resolveConfig, type AparteConfig } from '../../config/index.js';
import type { AparteMessage } from '../../types/models.js';
import type { AparteUsage } from '../../types/chat.js';
import type {
    AparteMessageDoneEventDetail, AparteMessageErrorEventDetail, AparteCompactDoneEventDetail,
    AparteCompactErrorEventDetail, AparteCompactEventDetail, AparteCompactStartEventDetail,
} from '../../types/events.js';
import { AparteErrorCode } from '../../types/errors.js';
import { measureContext, usageTokens, type AparteContextMeasure } from '../../context/measure.js';
import { chatBoundaryOf } from '../../utils/chat-boundary.js';
import { cssEscape } from '../../utils/css-escape.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';

/** How full the window is, against the two thresholds. */
export type AparteContextLevel = 'ok' | 'warn' | 'danger';

/** Detail of `aparte-context-threshold`: the level just entered, and the numbers behind it. */
export interface AparteContextThresholdEventDetail {
    level: AparteContextLevel;
    /** Tokens in use — the last turn's reported usage (prompt sent plus reply), or an estimate once the context has changed since. */
    used: number;
    /** The window those tokens are measured against. */
    window: number;
    /** `used / window`, capped at 1. */
    ratio: number;
    /** The chat this gauge watches, when it has an id. */
    targetId?: string;
}

const fraction = (raw: string | null, fallback: number): number => {
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
};

/** The id of the chat host an event came from, when it came from inside one. */
const hostIdOf = (target: EventTarget | null): string | undefined => {
    const node = target instanceof Element ? target.closest('aparte-chat, [data-aparte-chat]') : null;
    return node?.id || undefined;
};

const el = (tag: string, className: string, text?: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The ring: a track and a value circle on a 36-unit box. `pathLength="100"` makes the
 * value's dash the percentage itself (`stroke-dasharray: <ratio> 100`, in the sheet), so
 * the element sets one custom property per render and no geometry.
 */
const ringSvg = (): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'aparte-context__ring');
    svg.setAttribute('viewBox', '0 0 36 36');
    for (const part of ['track', 'value'] as const) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('class', `aparte-context__${part}`);
        circle.setAttribute('cx', '18');
        circle.setAttribute('cy', '18');
        circle.setAttribute('r', '15.5');
        if (part === 'value') circle.setAttribute('pathLength', '100');
        svg.appendChild(circle);
    }
    return svg;
};

/** What a transcript owner exposes: where the active path is read. */
interface TranscriptReader {
    getMessages(): AparteMessage[];
}

const readsMessages = (candidate: unknown): candidate is TranscriptReader =>
    !!candidate && typeof (candidate as TranscriptReader).getMessages === 'function';

/**
 * The object that holds a chat's active path: the chat host itself under a framework wrapper
 * (its list is the framework's own), else the viewport inside a vanilla chat — the host
 * element of a vanilla chat has no `getMessages`, and the viewport is the store there.
 */
const transcriptOf = (chat: Element | null): TranscriptReader | null => {
    if (!chat) return null;
    if (readsMessages(chat)) return chat;
    const viewport = (chat as { viewport?: unknown }).viewport ?? chat.querySelector('aparte-chat-viewport');
    return readsMessages(viewport) ? viewport : null;
};

/** Gives each gauge's panel an id of its own, for `aria-controls`. */
let panelSeq = 0;

const NO_PARTS = { system: 0, tools: 0, summary: 0, messages: 0 } as const;

/**
 * A gauge of the model's context window: how much of it the conversation uses, and what
 * fills it.
 *
 * It draws one number against the window. The number is what the last turn REPORTED —
 * `aparte-message-done` carries the provider's usage, and the prompt tokens of the last call
 * are the size of the context as the model saw it — for as long as nothing the model reads
 * has changed since. Once something has (a compaction summarised the history, a Restore
 * brought it back), the reported number describes a request that will not be sent again, so
 * the gauge measures the request that WOULD be sent and prefixes it with `~`: an estimate,
 * calibrated against the last reply, never a stale figure and never a blank. The measure is
 * `measureContext`, the same one the compaction plugin decides on.
 *
 * The WINDOW is the current model's `contextWindow` (a provider's `/models` fetch fills it
 * in), or the `window` attribute when you know better. With no window, or before the first
 * turn, it renders nothing — an affordance with nothing to show has no chrome to leave.
 *
 * Two thresholds turn it `warn` then `danger` (`data-level`), and crossing one fires
 * `aparte-context-threshold`. A turn the model refused as over its window
 * (`USAGE_CONTEXT_EXCEEDED` on `aparte-message-error`) turns it `danger` whatever the number
 * says: the model has just said what the number could not.
 *
 * The gauge is also a disclosure. It is a button (`aria-expanded`; click, Enter or Space) that
 * opens a panel listing what the window holds — the system prompt, the tools, the summary
 * of a compacted history, the messages — beside what is free. The parts are estimates and
 * labelled so; what the heuristic cannot see is `other`. When
 * `@aparte/plugin-compaction` is registered as the compactor and can say what compacting
 * would do, the panel adds "Compacting now would free ~N tokens" and a **Compact now** button.
 * While a compaction runs the element carries `data-compact="running"`, and `"failed"` after a
 * failure, with Retry in the panel. Escape and a click outside close it; nothing opens on hover.
 *
 * `auto-compact` is deprecated: the plugin decides when to compact now (after a turn, and
 * before a send that would overflow), so a page does not need the gauge to ask. It still
 * works — a turn that ends in `danger` dispatches `aparte-compact`, one request at a time,
 * with `auto: true` so the plugin can tell it from a button — and it will go away in a
 * future major version.
 *
 * A new chat or a conversation loaded in place of the last replaces the reading: it is
 * cleared on `aparte-reset-done` and, for a stored conversation, read from its last reply on
 * `aparte-conversation-loaded`. A restored reading never asks for a compaction, whatever its
 * level — that stays tied to the end of a turn.
 *
 * The bar wears the `aparte-progress` recipe. `variant="ring"` draws the same reading
 * as a ring with the percentage beside it — for a toolbar, where a bar wants a width
 * and a ring wants none; the full reading is the ring's `title`. The two share the
 * levels, the events, the panel and the accessible name; only the drawing differs.
 *
 * @element aparte-context
 *
 * @attr {number} window - The context window, in tokens. Overrides the current model's `contextWindow`.
 * @attr {number} used - Tokens in use before a turn of this page has reported any: a restored conversation's last usage. The next turn's usage replaces it.
 * @attr {number} warn - Fraction of the window at which the level turns `warn`. Default `0.75`.
 * @attr {number} danger - Fraction at which it turns `danger`. Default `0.9`.
 * @attr {boolean} auto-compact - Deprecated, still works. Dispatch `aparte-compact` (with `auto: true`) on each turn that ends in `danger`, one request at a time. `@aparte/plugin-compaction` decides when to compact by itself now, so leave this off.
 * @attr {string} target - The id of the `<aparte-chat>` to watch, when the element is not under it.
 * @attr {string} variant - `bar` (default) or `ring`: a progress bar with the reading beside it, or a ring with the percentage.
 * @attr {string} data-level - Reflected BY the element: `ok`, `warn` or `danger`. Read-only.
 * @attr {boolean} data-empty - Reflected BY the element while it has nothing to show. Read-only.
 * @attr {string} data-compact - Reflected BY the element while this chat is being compacted (`running`) and after a compaction failed (`failed`). Read-only.
 *
 * @fires {CustomEvent<AparteContextThresholdEventDetail>} aparte-context-threshold - The level changed. Bubbles.
 * @fires {CustomEvent<AparteCompactEventDetail>} aparte-compact - Dispatched on `window` when the deprecated `auto-compact` is set and a turn ends in `danger` (`auto: true`, with the `window` it measured against), and by Retry in the panel when no compactor is registered. One automatic request at a time — the next turn in `danger` asks again once the plugin has answered. `@aparte/plugin-compaction` answers it; with no listener nothing happens.
 *
 * @cssprop [--aparte-context-ring-size=22px] - Diameter of the ring variant.
 *
 * @example
 * <!-- The same gauge twice: the bar takes the room it is given, the ring takes none. -->
 * <aparte-composer-toolbar>
 *   <aparte-context window="128000" style="flex: 1"></aparte-context>
 *   <aparte-context window="128000" variant="ring"></aparte-context>
 * </aparte-composer-toolbar>
 *
 * <script>
 *   // The gauge reads what each turn reports; it draws nothing before the first one.
 *   // This is a provider's usage after a long conversation: 78% of a 128k window,
 *   // past the `warn` threshold.
 *   window.dispatchEvent(new CustomEvent('aparte-message-done', {
 *     detail: { usage: { inputTokens: 99400, outputTokens: 600 } },
 *   }));
 * </script>
 */
export class AparteContext extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['window', 'warn', 'danger', 'target', 'variant', 'used'];
    }

    /**
     * A reading with no transcript behind it: the `used` attribute's seed, or a turn's usage
     * when the chat's list cannot be read from here (a gauge placed far from its chat, a test).
     * When the list can be read, the measure comes from it and this is only the fallback.
     */
    private _used: number | null = null;
    private _level: AparteContextLevel | null = null;
    private _compactRequested = false;
    /** The last turn's usage and the reply it belongs to, so the measure has it before the list has written it back. */
    private _lastDone: { messageId: string | undefined; usage: AparteUsage } | null = null;
    /** What the model reads changed with nothing on the path to say so (a Restore): the reading is an estimate until the next turn reports. */
    private _viewChanged = false;
    /** A conversation was replaced and nothing has reported or loaded since: the list on screen is not read yet. */
    private _blank = false;
    /** The model refused a request as over its window; the level is `danger` until something changes. */
    private _overflow = false;
    private _compact: 'running' | 'failed' | null = null;
    private _failure = '';
    private _open = false;
    /** The reading drawn last, so the `used` getter and the panel read what is on screen. */
    private _measured: AparteContextMeasure | null = null;
    /** The chat an event last came from, for a gauge that is neither under its chat nor names it with `target`. */
    private _seen: Element | null = null;
    /** What the panel was last built from: a render that changes nothing leaves its nodes, and the focus in them, alone. */
    private _panelSignature = '';

    private _remember(target: EventTarget | null): void {
        const chat = target instanceof Element ? chatBoundaryOf(target) : null;
        if (chat) this._seen = chat;
    }

    private _onDone = (e: Event): void => {
        const detail = (e as CustomEvent<AparteMessageDoneEventDetail>).detail;
        if (!detail?.usage || !this._isMine(detail.targetId)) return;
        this._remember(e.target);
        this._used = usageTokens(detail.usage);
        this._lastDone = { messageId: detail.messageId, usage: detail.usage };
        this._viewChanged = false;
        this._blank = false;
        this._overflow = false;
        // The one render that may ask for a compaction: auto-compact is tied to the END of
        // a turn, never to a reading that was merely restored or re-drawn.
        this._render(true);
    };

    /**
     * A conversation is replaced — a new chat, or one loaded in place of the last — and the
     * previous reading is not this one's. The viewport says so with `aparte-reset-done` (no
     * detail: the chat is found from where the event came from). A load clears first and
     * `aparte-conversation-loaded` follows, so the reading is dropped here and read again
     * there. Until then the chat's list is not trusted: a framework's may not have caught up.
     */
    private _onReset = (e: Event): void => {
        if (!this._isMine(hostIdOf(e.target))) return;
        this._remember(e.target);
        this._used = null;
        this._lastDone = null;
        this._viewChanged = false;
        this._overflow = false;
        this._compact = null;
        this._blank = true;
        this._render();
    };

    /**
     * The messages of a stored conversation are on screen: the reading is the last reply's
     * usage — what a turn would have reported had it just ended. A transcript with none
     * (an empty one, a conversation saved before usage was kept) shows nothing, the same as
     * a chat that has not spoken yet.
     */
    private _onLoaded = (e: Event): void => {
        const detail = (e as CustomEvent<{ targetId?: string }>).detail;
        if (!this._isMine(detail?.targetId)) return;
        this._remember(e.target);
        this._blank = false;
        this._lastDone = null;
        this._viewChanged = false;
        this._overflow = false;
        this._compact = null;
        const host = e.target as { getMessages?: () => AparteMessage[] } | null;
        const messages = host?.getMessages?.() ?? [];
        const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.usage);
        this._used = last?.usage ? usageTokens(last.usage) : null;
        // Never `_render(true)`: a restored reading in danger must not start a compaction.
        this._render();
    };

    /** A compaction began for this chat: say so on the element and in the panel. */
    private _onCompactStart = (e: Event): void => {
        const detail = (e as CustomEvent<AparteCompactStartEventDetail | undefined>).detail;
        if (!this._isMine(detail?.targetId)) return;
        this._compact = 'running';
        this._failure = '';
        this._render();
    };

    /**
     * After a real compaction — or a Restore — what the model reads is a different size by an
     * amount nobody has measured yet, and the last reply's reported usage describes the request
     * from before. The gauge measures the request that would be sent now and says so with `~`,
     * rather than keeping a number it knows to be wrong or going blank until the next turn. The
     * event names the chat it compacted, so on a multi-chat page only that chat's gauge
     * moves; an unnamed one moves every gauge.
     *
     * Without a transcript to measure (a gauge that cannot read its chat's list) there is
     * nothing to estimate from, and the reading is dropped as it always was.
     */
    private _onCompacted = (e: Event): void => {
        const detail = (e as CustomEvent<AparteCompactDoneEventDetail>).detail;
        if (!this._isMine(detail?.targetId)) return;
        // The request is spent whatever the outcome. A skip (`empty`, `nothing-to-drop`,
        // `running`, `streaming`) used to return before this line, so with the usage
        // still climbing the level never left `danger` and the gauge never asked again
        // for the life of the element — one refused compaction latched auto-compact off.
        this._compactRequested = false;
        // Any answer ends the wait, a skip included: the compaction is no longer running.
        this._compact = null;
        if (detail?.skipped) {
            this._render();
            return;
        }
        this._viewChanged = true;
        this._overflow = false;
        if (!this._messages()) this._used = null;
        this._render();
    };

    /** A failed compaction spends the request too; the next `danger` asks again. */
    private _onCompactError = (e: Event): void => {
        const detail = (e as CustomEvent<AparteCompactErrorEventDetail | undefined>).detail;
        if (!this._isMine(detail?.targetId)) return;
        this._compactRequested = false;
        // A cancelled compaction (Stop, Restore) is not a failure: no "failed", no Retry.
        this._compact = detail?.aborted ? null : 'failed';
        this._failure = detail?.aborted ? '' : (typeof detail?.error === 'string' ? detail.error : '');
        this._render();
    };

    /** The model refused this chat's request as over its window: the number was wrong, and so is "ok". */
    private _onMessageError = (e: Event): void => {
        const detail = (e as CustomEvent<AparteMessageErrorEventDetail | undefined>).detail;
        if (!this._isMine(detail?.targetId)) return;
        if ((detail?.error as { code?: unknown } | undefined)?.code !== AparteErrorCode.USAGE_CONTEXT_EXCEEDED) return;
        this._remember(e.target);
        this._overflow = true;
        this._render();
    };

    private _onRerender = (): void => this._render();

    /** Tokens in use — what is drawn — else the last reported or seeded reading, else `null`. */
    get used(): number | null {
        return this._measured?.used ?? this._used;
    }

    /**
     * Writes the `used` attribute: a reading for a conversation restored without a turn of
     * this page, which had nothing to report until the next one. `null` clears it.
     */
    set used(value: number | null) {
        if (value === null || value === undefined) this.removeAttribute('used');
        else this.setAttribute('used', String(value));
    }

    /** The window in force — the attribute, else the current model's. */
    get window(): number | null {
        return this._window();
    }

    /**
     * Writes the `window` attribute; `null` gives the model's own window back.
     *
     * The setter has to exist: React 19 and Svelte assign the PROPERTY whenever the
     * element has one of that name, so `<aparte-context window={8000}>` — a spelling
     * both wrappers type as valid — hit a getter alone and threw.
     */
    set window(value: number | null) {
        if (value === null || value === undefined) this.removeAttribute('window');
        else this.setAttribute('window', String(value));
    }

    /** The current level, or `null` while nothing is shown. */
    get level(): AparteContextLevel | null {
        return this._level;
    }

    /** The reading drawn now, parts and all, or `null` while nothing is shown. */
    get measure(): AparteContextMeasure | null {
        return this._measured;
    }

    connectedCallback(): void {
        window.addEventListener('aparte-message-done', this._onDone);
        window.addEventListener('aparte-message-error', this._onMessageError);
        window.addEventListener('aparte-compact-start', this._onCompactStart);
        window.addEventListener('aparte-compact-done', this._onCompacted);
        window.addEventListener('aparte-compact-error', this._onCompactError);
        window.addEventListener('aparte-reset-done', this._onReset);
        window.addEventListener('aparte-conversation-loaded', this._onLoaded);
        // The model's window is read again at every render, so a model change shows
        // on the next turn; no listener on the picker's event, which is an element's.
        // A compactor registered after the gauge was drawn arrives the same way.
        window.addEventListener('aparte-config-change', this._onRerender);
        this.addEventListener('click', this._onClick);
        this._render();
    }

    disconnectedCallback(): void {
        window.removeEventListener('aparte-message-done', this._onDone);
        window.removeEventListener('aparte-message-error', this._onMessageError);
        window.removeEventListener('aparte-compact-start', this._onCompactStart);
        window.removeEventListener('aparte-compact-done', this._onCompacted);
        window.removeEventListener('aparte-compact-error', this._onCompactError);
        window.removeEventListener('aparte-reset-done', this._onReset);
        window.removeEventListener('aparte-conversation-loaded', this._onLoaded);
        window.removeEventListener('aparte-config-change', this._onRerender);
        this.removeEventListener('click', this._onClick);
        this._stopListeningWhileOpen();
    }

    attributeChangedCallback(name: string): void {
        if (name === 'used') {
            const n = Number(this.getAttribute('used'));
            this._used = this.hasAttribute('used') && Number.isFinite(n) && n >= 0 ? n : null;
        }
        if (this.isConnected) this._render();
    }

    /**
     * The config the chat this gauge watches answers to, not the one at the gauge's own
     * position. A gauge in a header, with `target=`, stands outside the chat's boundary, and
     * a chat that carries its own config (a wrapper's `config` prop) has its own prompt, tools,
     * window and compactor: the client and the plugin read them from there, so the gauge must
     * too, or it measures a different request and offers no Compact now. Resolved live, like
     * every config read: the boundary may be attached after this element connects.
     */
    private _cfg(): AparteConfig {
        return resolveConfig(this._chat() ?? this);
    }

    private _window(): number | null {
        const attr = Number(this.getAttribute('window'));
        if (this.hasAttribute('window') && Number.isFinite(attr) && attr > 0) return attr;
        const model = this._cfg().getCurrentModel();
        return model?.contextWindow && model.contextWindow > 0 ? model.contextWindow : null;
    }

    /** The chat this gauge watches: `target`, else the chat host above it — the composer's rule. */
    private _ownTargetId(): string | undefined {
        const attr = this.getAttribute('target');
        if (attr) return attr;
        let node: HTMLElement | null = this.parentElement;
        while (node) {
            const isHost = node.tagName.toLowerCase() === 'aparte-chat' || node.hasAttribute('data-aparte-chat');
            if (isHost && node.id) return node.id;
            node = node.parentElement;
        }
        return undefined;
    }

    private _isMine(targetId?: string): boolean {
        const own = this._ownTargetId();
        return !targetId || !own || targetId === own;
    }

    /**
     * The chat's element: the one `target` names, else the chat above the gauge, else the one
     * its events last came from. Passed to the compactor as it is — a chat inside a shadow
     * root is not found by id, so the element is the address that always works.
     */
    private _chat(): Element | null {
        const attr = this.getAttribute('target');
        if (attr) {
            const root = this.getRootNode() as Document | ShadowRoot;
            const named = root.getElementById?.(attr) ?? document.getElementById(attr);
            if (named) return named;
        }
        const above = chatBoundaryOf(this);
        if (above) return above;
        return this._seen?.isConnected ? this._seen : null;
    }

    /** The chat's active path, or `null` when it cannot be read from here. */
    private _messages(): AparteMessage[] | null {
        const reader = transcriptOf(this._chat());
        if (!reader) return null;
        try {
            return reader.getMessages();
        } catch {
            return null;
        }
    }

    /**
     * What to draw: the measure of the chat's own transcript when it holds a reply with usage
     * (or the model has just refused a request, and an estimate is better than nothing), else
     * the seeded or reported number with nothing to break down.
     *
     * The last turn's usage is laid over its reply when the list has not written it back yet.
     * If the list does not hold that reply at all it is not used: the list is the path on
     * screen, and a reply that is not on it (a branch was switched) is not its reading.
     */
    private _measure(capacity: number): AparteContextMeasure | null {
        const stored = this._messages();
        const done = this._lastDone;
        const messages = stored && done?.messageId
            ? stored.map((m) => (m.id === done.messageId && !m.usage ? { ...m, usage: done.usage } : m))
            : stored;
        const hasUsage = !!messages?.some((m) => m.role === 'assistant' && m.usage);
        if (messages && ((hasUsage && !this._blank) || (this._overflow && messages.length > 0))) {
            return measureContext({ messages, config: this._cfg(), windowOverride: capacity, viewChanged: this._viewChanged });
        }
        if (this._used === null) return null;
        return { window: capacity, used: this._used, estimated: false, parts: { ...NO_PARTS }, other: this._used };
    }

    private _render(askToCompact = false): void {
        const capacity = this._window();
        const measure = capacity === null ? null : this._measure(capacity);
        // Reflected even while nothing is drawn: a compaction is running whether or not there
        // is a reading to show for it.
        if (this._compact) this.setAttribute('data-compact', this._compact);
        else this.removeAttribute('data-compact');
        if (capacity === null || measure === null) {
            this._measured = null;
            this.setAttribute('data-empty', '');
            this.removeAttribute('data-level');
            this._open = false;
            this._stopListeningWhileOpen();
            this._panelSignature = '';
            this.replaceChildren();
            this._level = null;
            return;
        }
        this._measured = measure;
        this.removeAttribute('data-empty');

        const used = measure.used;
        const ratio = Math.min(1, used / capacity);
        const warn = fraction(this.getAttribute('warn'), 0.75);
        const danger = fraction(this.getAttribute('danger'), 0.9);
        const level: AparteContextLevel = this._overflow || ratio >= danger ? 'danger' : ratio >= warn ? 'warn' : 'ok';
        this.setAttribute('data-level', level);

        const ring = this.getAttribute('variant') === 'ring';
        let root = this.querySelector<HTMLElement>('.aparte-context');
        // A variant change rebuilds: the bar and the ring share nothing but their text.
        if (root && root.classList.contains('aparte-context--ring') !== ring) {
            this.replaceChildren();
            root = null;
            this._panelSignature = '';
        }
        let meter = this.querySelector<HTMLElement | SVGElement>('[role="meter"]');
        let text = this.querySelector<HTMLElement>('.aparte-context__text');
        let toggle = this.querySelector<HTMLButtonElement>('.aparte-context__toggle');
        let name = this.querySelector<HTMLElement>('.aparte-context__name');
        let panel = this.querySelector<HTMLElement>('.aparte-context__panel');
        if (!root || !meter || !text || !toggle || !name || !panel) {
            root = el('div', ring ? 'aparte-context aparte-context--ring' : 'aparte-context');
            meter = ring ? ringSvg() : el('div', 'aparte-progress');
            meter.setAttribute('role', 'meter');
            if (!ring) meter.appendChild(el('div', 'aparte-progress__bar'));
            // The disclosure is the reading beside the drawing, not the drawing: a meter
            // inside a button is presentational to a screen reader, and a tab stop wants a
            // name. The button's name is the label (visually hidden) and the words it shows.
            toggle = el('button', 'aparte-btn aparte-btn--ghost aparte-btn--sm aparte-context__toggle') as HTMLButtonElement;
            toggle.type = 'button';
            name = el('span', 'aparte-sr-only');
            name.classList.add('aparte-context__name');
            text = el('span', 'aparte-context__text');
            toggle.append(name, text);
            panel = el('div', 'aparte-context__panel aparte-popover');
            panel.id = `aparte-context-panel-${++panelSeq}`;
            panel.setAttribute('role', 'group');
            panel.hidden = true;
            toggle.setAttribute('aria-controls', panel.id);
            root.append(meter, toggle, panel);
            this.replaceChildren(root);
            this._panelSignature = '';
        }
        /*
         * The locale's tag, not the browser's.
         *
         * `Intl.NumberFormat(undefined, …)` means "follow the BROWSER", which is not
         * the locale the app chose — the exact bug `AparteLocale.tag` exists to close,
         * and which `<aparte-conversation-list>` and the bubble's clock already read
         * it for. On a French page `128 000` came out `128K` and the ring read `14%`
         * where French writes `14 %`; on `ja-JP`, `12.8万` is the compact notation
         * and the gauge showed `128K`.
         *
         * `|| undefined` and not `??`: an empty tag is not a language, and passing
         * `''` to `Intl` throws a RangeError rather than falling back.
         */
        const cfg = this._cfg();
        const tag = cfg.getLocale().tag || undefined;
        const format = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
        // An estimate says so: the tilde is the shortest honest word for it.
        const approx = measure.estimated ? '~' : '';
        const reading = `${approx}${format.format(used)} / ${format.format(capacity)}`;
        const percent = Math.round(ratio * 100);
        const label = cfg.t('contextLabel') || 'Context window';
        if (ring) {
            const value = meter.querySelector<SVGElement>('.aparte-context__value');
            value?.style.setProperty('--aparte-context-ratio', String(percent));
            // A zero-length dash with round caps is still a dot; at 0 the value is not drawn.
            value?.classList.toggle('aparte-context__value--empty', percent === 0);
            // The ring shows the percentage; the reading behind it is one hover away.
            root.title = reading;
        } else {
            meter.style.setProperty('--aparte-progress-value', String(percent));
        }
        meter.setAttribute('aria-valuemin', '0');
        meter.setAttribute('aria-valuemax', String(capacity));
        meter.setAttribute('aria-valuenow', String(used));
        meter.setAttribute('aria-label', `${label}: ${reading}`);
        name.textContent = `${label}: `;
        toggle.setAttribute('aria-expanded', String(this._open));
        // The label is the SAME integer the dash draws — formatted, not rounded again: two
        // roundings of one ratio disagreed by a point on real windows (0.145 → 14 and "15 %").
        text.textContent = ring
            ? `${approx}${new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }).format(percent / 100)}`
            : reading;
        panel.setAttribute('aria-label', label);
        panel.hidden = !this._open;
        if (this._open) this._renderPanel(panel, measure, capacity, format);
        else this._panelSignature = '';

        if (level !== this._level) {
            this._level = level;
            const targetId = this._ownTargetId();
            const detail: AparteContextThresholdEventDetail = { level, used, window: capacity, ratio, targetId };
            this.dispatchEvent(new CustomEvent<AparteContextThresholdEventDetail>('aparte-context-threshold', { detail, bubbles: true, composed: true }));
            if (level !== 'danger') this._compactRequested = false;
        }
        // Asked per TURN, not per level change: one request stays open until the
        // plugin answers (done, skipped or failed), and the next turn in danger asks
        // again. Tied to the level change, a refused compaction — nothing to drop yet,
        // a stream in flight — left the level at danger and the gauge silent for good.
        if (askToCompact && level === 'danger' && this.hasAttribute('auto-compact') && !this._compactRequested) {
            this._compactRequested = true;
            window.dispatchEvent(new CustomEvent<AparteCompactEventDetail>('aparte-compact', {
                detail: { targetId: this._ownTargetId(), auto: true, window: capacity },
            }));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The panel
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * What the window holds, row by row, and what can be done about it.
     *
     * The parts are raw estimates and `used` is the number the gauge draws — measured or
     * calibrated — so they need not agree. The panel never shows a sum above the total: when
     * the estimates add up to more than `used`, each is scaled down to fit and `other` is
     * zero; otherwise the difference is `other`, the part the heuristic cannot see.
     */
    private _renderPanel(panel: HTMLElement, measure: AparteContextMeasure, capacity: number, format: Intl.NumberFormat): void {
        const cfg = this._cfg();
        const compactor = cfg.getCompactor();
        const chat = this._chat();
        const targetId = this._ownTargetId();
        let preview: { messages: number; tokens: number } | null = null;
        try {
            preview = compactor?.preview?.({ target: chat, ...(targetId ? { targetId } : {}) }) ?? null;
        } catch {
            preview = null;
        }

        const { parts, used } = measure;
        const sum = parts.system + parts.tools + parts.summary + parts.messages;
        const scale = sum > used && sum > 0 ? used / sum : 1;
        const approxOf = measure.estimated ? '~' : '';
        // The parts and `other` are estimates whatever `used` is; what is free follows `used`.
        const rows: Array<{ key: string; label: string; tokens: number; approx: string }> = [
            { key: 'system', label: cfg.t('contextSystem') || 'System prompt', tokens: parts.system * scale, approx: '~' },
            { key: 'tools', label: cfg.t('contextTools') || 'Tools', tokens: parts.tools * scale, approx: '~' },
            { key: 'summary', label: cfg.t('contextSummary') || 'Summary', tokens: parts.summary * scale, approx: '~' },
            { key: 'messages', label: cfg.t('contextMessages') || 'Messages', tokens: parts.messages * scale, approx: '~' },
            { key: 'other', label: cfg.t('contextOther') || 'Other', tokens: scale < 1 ? 0 : measure.other, approx: '~' },
            { key: 'free', label: cfg.t('contextFree') || 'Free', tokens: Math.max(0, capacity - used), approx: approxOf },
        ];
        const total = `${approxOf}${format.format(used)} / ${format.format(capacity)}`;
        const reclaim = preview && preview.tokens > 0
            ? (cfg.t('contextReclaim') || 'Compacting now would free ~{n} tokens').replace('{n}', () => format.format(Math.round(preview!.tokens)))
            : '';
        const canCompact = !!compactor && !!preview && this._compact === null;

        const list = el('ul', 'aparte-context__rows');
        for (const row of rows) {
            const item = el('li', 'aparte-context__row');
            item.setAttribute('data-part', row.key);
            item.append(el('span', 'aparte-context__row-label', row.label));
            item.append(el('span', 'aparte-context__row-value', `${row.approx}${format.format(Math.round(row.tokens))}`));
            const bar = el('div', 'aparte-progress aparte-context__row-bar');
            bar.setAttribute('aria-hidden', 'true');
            bar.style.setProperty('--aparte-progress-value', String(Math.round(Math.min(1, row.tokens / capacity) * 100)));
            bar.appendChild(el('div', 'aparte-progress__bar'));
            item.append(bar);
            list.append(item);
        }
        const totalRow = el('li', 'aparte-context__row aparte-context__row--total');
        totalRow.setAttribute('data-part', 'total');
        totalRow.append(el('span', 'aparte-context__row-label', cfg.t('contextTotal') || 'Total'), el('span', 'aparte-context__row-value', total));
        list.append(totalRow);

        const nodes: HTMLElement[] = [list];
        if (this._compact === 'running') {
            const status = el('p', 'aparte-context__status aparte-shimmer', cfg.t('checkpointPending') || 'Summarising the context…');
            status.setAttribute('role', 'status');
            nodes.push(status);
        } else if (this._compact === 'failed') {
            const status = el('p', 'aparte-context__status aparte-context__status--failed', cfg.t('checkpointFailed') || "Couldn't summarise the context");
            status.setAttribute('role', 'status');
            if (this._failure) {
                status.title = this._failure;
                status.appendChild(el('span', 'aparte-sr-only', `: ${this._failure}`));
            }
            nodes.push(status, this._action('retry', cfg.t('retry') || 'Retry'));
        }
        if (reclaim) nodes.push(el('p', 'aparte-context__reclaim', reclaim));
        if (canCompact) nodes.push(this._action('compact', cfg.t('contextCompactNow') || 'Compact now'));

        // Built off to the side and compared: a render that changes nothing (a config change
        // elsewhere on the page) must not replace the button the keyboard is on.
        const next = el('div', 'aparte-context__content');
        next.append(...nodes);
        if (next.innerHTML === this._panelSignature) return;
        this._panelSignature = next.innerHTML;
        const active = document.activeElement;
        const hadFocus = active && panel.contains(active) ? active.getAttribute('data-context-action') ?? '' : null;
        panel.replaceChildren(...Array.from(next.childNodes));
        if (hadFocus !== null) {
            // The control the keyboard was on may be gone (Compact now became "running"):
            // keep the focus in the gauge rather than dropping it on the page.
            const same = hadFocus ? (panel.querySelector(`[data-context-action="${cssEscape(hadFocus)}"]`) as HTMLElement | null) : null;
            (same ?? this.querySelector<HTMLElement>('.aparte-context__toggle'))?.focus();
        }
    }

    private _action(name: string, label: string): HTMLButtonElement {
        const button = el('button', 'aparte-btn aparte-btn--sm aparte-btn--surface aparte-context__action', label) as HTMLButtonElement;
        button.type = 'button';
        button.setAttribute('data-context-action', name);
        return button;
    }

    /**
     * Ask the registered compactor to compact this chat now, as a person asked. With none
     * registered (Retry only — Compact now is not offered without one) the command event
     * is the way to ask, the one a host's own button uses.
     */
    private async _compactNow(reason: 'manual' | 'retry'): Promise<void> {
        const compactor = this._cfg().getCompactor();
        const targetId = this._ownTargetId();
        if (!compactor) {
            window.dispatchEvent(new CustomEvent<AparteCompactEventDetail>('aparte-compact', { detail: { targetId } }));
            return;
        }
        this._compact = 'running';
        this._failure = '';
        this._render();
        let failed: string | null = null;
        try {
            const outcome = await compactor.compact({ target: this._chat(), ...(targetId ? { targetId } : {}), force: true, reason });
            if (!outcome.ok) failed = outcome.error;
            else if (!outcome.skipped) this._viewChanged = true;
        } catch (error) {
            failed = error instanceof Error ? error.message : String(error);
        }
        // The compaction events say the same, and settle first when the compactor dispatches
        // them; this settles a compactor that does not.
        if (this._compact === 'running') {
            this._compact = failed === null ? null : 'failed';
            this._failure = failed ?? '';
        }
        if (this.isConnected) this._render();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The disclosure
    // ─────────────────────────────────────────────────────────────────────────

    private _onClick = (event: Event): void => {
        const target = event.target as HTMLElement | null;
        const action = target?.closest?.<HTMLElement>('[data-context-action]');
        if (action) {
            void this._compactNow(action.getAttribute('data-context-action') === 'retry' ? 'retry' : 'manual');
            return;
        }
        // Anything inside the panel but a button is just the panel; everywhere else on the
        // gauge — the toggle, the bar or ring — opens and closes it. The toggle is the one
        // control a keyboard reaches; the drawing is a larger target for a pointer.
        if (target?.closest?.('.aparte-context__panel')) return;
        if (!target?.closest?.('.aparte-context')) return;
        this._setOpen(!this._open);
    };

    private _setOpen(open: boolean, returnFocus = false): void {
        if (open === this._open) return;
        this._open = open;
        if (open) this._listenWhileOpen();
        else this._stopListeningWhileOpen();
        this._render();
        if (open) this._place();
        else if (returnFocus) this.querySelector<HTMLElement>('.aparte-context__toggle')?.focus();
    }

    /**
     * Escape and a click anywhere else close the panel. Listened for on the document only
     * while it is open: a page full of closed gauges holds no listeners but its own.
     */
    private _onDocumentClick = (event: Event): void => {
        if (!event.composedPath().includes(this)) this._setOpen(false);
    };

    private _onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        const inside = event.composedPath().includes(this);
        // A press inside the gauge is for the gauge; one elsewhere still closes it but is
        // left to whatever else listens for Escape (a dialog, the composer).
        if (inside) event.stopPropagation();
        this._setOpen(false, inside || this.contains(document.activeElement));
    };

    private _listenWhileOpen(): void {
        document.addEventListener('click', this._onDocumentClick);
        document.addEventListener('keydown', this._onDocumentKeydown);
    }

    private _stopListeningWhileOpen(): void {
        document.removeEventListener('click', this._onDocumentClick);
        document.removeEventListener('keydown', this._onDocumentKeydown);
    }

    /**
     * Where the panel opens: above the reading by default, since a gauge usually sits in the
     * composer at the foot of the page; below when there is no room above, and flush with the
     * other edge when it would run past the window's.
     */
    private _place(): void {
        const panel = this.querySelector<HTMLElement>('.aparte-context__panel');
        if (!panel) return;
        panel.removeAttribute('data-placement');
        panel.removeAttribute('data-align');
        const anchor = this.getBoundingClientRect();
        const box = panel.getBoundingClientRect();
        if (box.height > 0 && anchor.top < box.height) panel.setAttribute('data-placement', 'below');
        if (box.width > 0 && box.right > document.documentElement.clientWidth) panel.setAttribute('data-align', 'end');
    }
}

deferHydrationOf(AparteContext);
if (!customElements.get('aparte-context')) {
    customElements.define('aparte-context', AparteContext);
}
