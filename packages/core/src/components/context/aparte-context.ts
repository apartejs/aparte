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
 * a gauge that turns red and then does nothing was missing. What answers the command
 * is `@aparte/plugin-compaction` (`setupCompaction()`): it summarises what no longer
 * fits the window and keeps the recent turns. Core itself does not compact — the
 * gauge asks, the plugin does, and a page without the plugin gets a gauge that only
 * measures.
 *
 * The bar wears the `aparte-progress` recipe. `variant="ring"` draws the same reading
 * as a ring with the percentage beside it — for a toolbar, where a bar wants a width
 * and a ring wants none; the full reading is the ring's `title`. The two share the
 * levels, the events and the accessible name; only the drawing differs.
 *
 * @element aparte-context
 *
 * @attr {number} window - The context window, in tokens. Overrides the current model's `contextWindow`.
 * @attr {number} warn - Fraction of the window at which the level turns `warn`. Default `0.75`.
 * @attr {number} danger - Fraction at which it turns `danger`. Default `0.9`.
 * @attr {boolean} auto-compact - Dispatch `aparte-compact` on reaching `danger` (once per crossing).
 * @attr {string} target - The id of the `<aparte-chat>` to watch, when the element is not under it.
 * @attr {string} variant - `bar` (default) or `ring`: a progress bar with the reading beside it, or a ring with the percentage.
 * @attr {string} data-level - Reflected BY the element: `ok`, `warn` or `danger`. Read-only.
 * @attr {boolean} data-empty - Reflected BY the element while it has nothing to show. Read-only.
 *
 * @fires {CustomEvent<AparteContextThresholdEventDetail>} aparte-context-threshold - The level changed. Bubbles.
 *
 * @cssprop [--aparte-context-ring-size=22px] - Diameter of the ring variant.
 * @cssprop [--aparte-context-ring-stroke=4] - Thickness of the ring, in its own units (the ring is drawn on a 36-unit box).
 *
 * @example
 * <!-- The same gauge twice: the bar takes the room it is given, the ring takes none. -->
 * <aparte-composer-toolbar>
 *   <aparte-context window="128000" auto-compact style="flex: 1"></aparte-context>
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
        return ['window', 'warn', 'danger', 'target', 'variant'];
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
     * than a number it knows to be wrong. The event names the chat it compacted, so on a
     * multi-chat page only that chat's gauge resets; an unnamed one resets every gauge,
     * and each is right again one turn later.
     */
    private _onCompacted = (e: Event): void => {
        const detail = (e as CustomEvent<AparteCompactDoneEventDetail>).detail;
        if (detail?.skipped || !this._isMine(detail?.targetId)) return;
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

        const ring = this.getAttribute('variant') === 'ring';
        let root = this.querySelector<HTMLElement>('.aparte-context');
        // A variant change rebuilds: the bar and the ring share nothing but their text.
        if (root && root.classList.contains('aparte-context--ring') !== ring) {
            this.replaceChildren();
            root = null;
        }
        let meter = this.querySelector<HTMLElement | SVGElement>('[role="meter"]');
        let text = this.querySelector<HTMLElement>('.aparte-context__text');
        if (!root || !meter || !text) {
            root = el('div', ring ? 'aparte-context aparte-context--ring' : 'aparte-context');
            meter = ring ? ringSvg() : el('div', 'aparte-progress');
            meter.setAttribute('role', 'meter');
            if (!ring) meter.appendChild(el('div', 'aparte-progress__bar'));
            text = el('span', 'aparte-context__text');
            root.append(meter, text);
            this.replaceChildren(root);
        }
        const format = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
        const reading = `${format.format(used)} / ${format.format(capacity)}`;
        const percent = Math.round(ratio * 100);
        const label = resolveConfig(this).t('contextLabel') || 'Context window';
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
        // The label is the SAME integer the dash draws — formatted, not rounded again: two
        // roundings of one ratio disagreed by a point on real windows (0.145 → 14 and "15 %").
        text.textContent = ring
            ? new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 }).format(percent / 100)
            : reading;

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
