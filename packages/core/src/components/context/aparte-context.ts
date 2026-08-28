import { resolveConfig } from '../../config/index.js';
import type { AparteMessageDoneEventDetail, AparteCompactDoneEventDetail } from '../../types/events.js';

/** How full the window is, against the two thresholds. */
export type AparteContextLevel = 'ok' | 'warn' | 'danger';

/** Detail of `aparte-context-threshold`: the level just entered, and the numbers behind it. */
export interface AparteContextThresholdEventDetail {
    level: AparteContextLevel;
    /** Tokens the last turn reported as used — the prompt sent plus the reply. */
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

const el = (tag: string, className: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/**
 * A gauge of the model's context window: how much of it the conversation uses.
 *
 * It reads two numbers and draws their ratio. The USED part is what each turn reports —
 * `aparte-message-done` carries the provider's usage, and the prompt tokens of the
 * last call are the size of the context as the model saw it. The WINDOW is the
 * current model's `contextWindow` (a provider's `/models` fetch fills it in), or the
 * `window` attribute when you know better. With no window, or before the first turn,
 * it renders nothing — an affordance with nothing to show has no chrome to leave.
 *
 * Two thresholds turn it `warn` then `danger` (`data-level`), and crossing one fires
 * `aparte-context-threshold`. With `auto-compact`, reaching `danger` dispatches
 * `aparte-compact` for its chat — once, until the level drops again — which is what
 * a gauge that turns red and then does nothing was missing. `AparteClient.compact()`
 * summarises the whole history by default; give the client `@aparte/engine`'s
 * `createCompactionSelector` and only what no longer fits the window is summarised.
 *
 * The bar wears the `aparte-progress` recipe; this element declares no custom
 * property of its own.
 *
 * @element aparte-context
 *
 * @attr {number} window - The context window, in tokens. Overrides the current model's `contextWindow`.
 * @attr {number} warn - Fraction of the window at which the level turns `warn`. Default `0.75`.
 * @attr {number} danger - Fraction at which it turns `danger`. Default `0.9`.
 * @attr {boolean} auto-compact - Dispatch `aparte-compact` on reaching `danger` (once per crossing).
 * @attr {string} target - The id of the `<aparte-chat>` to watch, when the element is not under it.
 * @attr {string} data-level - Reflected BY the element: `ok`, `warn` or `danger`. Read-only.
 * @attr {boolean} data-empty - Reflected BY the element while it has nothing to show. Read-only.
 *
 * @fires {CustomEvent<AparteContextThresholdEventDetail>} aparte-context-threshold - The level changed. Bubbles.
 *
 * @example
 * <aparte-composer-toolbar>
 *   <aparte-context auto-compact style="flex: 1"></aparte-context>
 * </aparte-composer-toolbar>
 */
export class AparteContext extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['window', 'warn', 'danger', 'target'];
    }

    private _used: number | null = null;
    private _level: AparteContextLevel | null = null;
    private _compactRequested = false;

    private _onDone = (e: Event): void => {
        const detail = (e as CustomEvent<AparteMessageDoneEventDetail>).detail;
        if (!detail?.usage || !this._isMine(detail.targetId)) return;
        const { usage } = detail;
        this._used = usage.totalTokens ?? (usage.inputTokens + usage.outputTokens);
        this._render();
    };

    /**
     * After a real compaction the context is smaller by an amount nobody has measured
     * yet — the next turn's usage will say. Until then the gauge shows nothing rather
     * than a number it knows to be wrong. (`aparte-compact-done` names no chat: on a
     * multi-chat page every gauge resets, and each is right again one turn later.)
     */
    private _onCompacted = (e: Event): void => {
        const detail = (e as CustomEvent<AparteCompactDoneEventDetail>).detail;
        if (detail?.skipped) return;
        this._used = null;
        this._compactRequested = false;
        this._render();
    };

    private _onRerender = (): void => this._render();

    /** Tokens the last turn reported, or `null` before the first turn. */
    get used(): number | null {
        return this._used;
    }

    /** The window in force — the attribute, else the current model's. */
    get window(): number | null {
        return this._window();
    }

    /** The current level, or `null` while nothing is shown. */
    get level(): AparteContextLevel | null {
        return this._level;
    }

    connectedCallback(): void {
        window.addEventListener('aparte-message-done', this._onDone);
        window.addEventListener('aparte-compact-done', this._onCompacted);
        // The model's window is read again at every render, so a model change shows
        // on the next turn; no listener on the picker's event, which is an element's.
        window.addEventListener('aparte-config-change', this._onRerender);
        this._render();
    }

    disconnectedCallback(): void {
        window.removeEventListener('aparte-message-done', this._onDone);
        window.removeEventListener('aparte-compact-done', this._onCompacted);
        window.removeEventListener('aparte-config-change', this._onRerender);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) this._render();
    }

    private _window(): number | null {
        const attr = Number(this.getAttribute('window'));
        if (this.hasAttribute('window') && Number.isFinite(attr) && attr > 0) return attr;
        const model = resolveConfig(this).getCurrentModel();
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

    private _render(): void {
        const capacity = this._window();
        if (capacity === null || this._used === null) {
            this.setAttribute('data-empty', '');
            this.removeAttribute('data-level');
            this.replaceChildren();
            this._level = null;
            return;
        }
        this.removeAttribute('data-empty');

        const used = this._used;
        const ratio = Math.min(1, used / capacity);
        const warn = fraction(this.getAttribute('warn'), 0.75);
        const danger = fraction(this.getAttribute('danger'), 0.9);
        const level: AparteContextLevel = ratio >= danger ? 'danger' : ratio >= warn ? 'warn' : 'ok';
        this.setAttribute('data-level', level);

        let bar = this.querySelector<HTMLElement>('.aparte-progress');
        let text = this.querySelector<HTMLElement>('.aparte-context__text');
        if (!bar || !text) {
            const root = el('div', 'aparte-context');
            bar = el('div', 'aparte-progress');
            bar.setAttribute('role', 'meter');
            bar.appendChild(el('div', 'aparte-progress__bar'));
            text = el('span', 'aparte-context__text');
            root.append(bar, text);
            this.replaceChildren(root);
        }
        const format = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
        const reading = `${format.format(used)} / ${format.format(capacity)}`;
        const label = resolveConfig(this).t('contextLabel') || 'Context window';
        bar.style.setProperty('--aparte-progress-value', String(Math.round(ratio * 100)));
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', String(capacity));
        bar.setAttribute('aria-valuenow', String(used));
        bar.setAttribute('aria-label', `${label}: ${reading}`);
        text.textContent = reading;

        if (level !== this._level) {
            this._level = level;
            const targetId = this._ownTargetId();
            const detail: AparteContextThresholdEventDetail = { level, used, window: capacity, ratio, targetId };
            this.dispatchEvent(new CustomEvent<AparteContextThresholdEventDetail>('aparte-context-threshold', { detail, bubbles: true, composed: true }));
            if (level === 'danger' && this.hasAttribute('auto-compact') && !this._compactRequested) {
                this._compactRequested = true;
                window.dispatchEvent(new CustomEvent('aparte-compact', { detail: { targetId } }));
            }
            if (level !== 'danger') this._compactRequested = false;
        }
    }
}

if (!customElements.get('aparte-context')) {
    customElements.define('aparte-context', AparteContext);
}
