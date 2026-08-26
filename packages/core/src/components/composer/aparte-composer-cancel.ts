import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';
import { controlMarkup, updateControl } from '../../utils/control.js';

/**
 * This element's button. A child already carrying it suppresses core's own render,
 * so the name is a published contract — see `utils/control.ts` for why it is spelled
 * out rather than initialled.
 */
const CANCEL_BUTTON_CLASS = 'aparte-composer-cancel__button';


/**
 * Cancel/stop-streaming button, a part of <aparte-composer>.
 *
 * Most composers should not use this element. `<aparte-composer-send>` already becomes
 * the stop button while a reply streams, so adding this one gives you a second, equally
 * working way to stop; reach for it only when you want stop to live somewhere the send
 * button is not.
 *
 * It renders hidden, and only the root reveals it — the `root.streaming` check on connect,
 * then each `streaming-change` — so it needs an `<aparte-composer>` ancestor to be
 * reachable at all: standalone, nothing flips `hidden` and the click has no `cancel()` to
 * call. A locale or icon-set change is re-read in place rather than re-rendered, for the
 * same reason: a rebuild renders it hidden again, making the stop button vanish mid-turn.
 *
 * It owns its subtree — the button is generated on connect and children placed inside
 * are replaced, so there is nothing to project. The host element is `display: contents`
 * and adds no box of its own; the row you put it in provides the layout, and the CSS
 * variables below style the inner button, which is deliberately a quiet action button
 * rather than a filled one.
 *
 * @element aparte-composer-cancel
 *
 * @cssprop [--aparte-composer-control-size=44px] - Width/height of the button inside the
 *          `.aparte-composer-row` layout helper, shared with the composer's other
 *          controls so the row stays aligned.
 * @cssprop [--aparte-radius-action-btn=4px] - Corner radius of the button.
 * @cssprop --aparte-neutral - Icon colour at rest (the button's background is
 *          transparent).
 * @cssprop --aparte-text - Icon colour on hover.
 * @cssprop --aparte-surface-2 - Button background on hover.
  *
 * @example
 * <!-- Only needed when you want a SEPARATE stop button: <aparte-composer-send> already
 *      turns into one while streaming. This stays hidden until then. -->
 * <aparte-composer>
 *   <div class="aparte-composer-row">
 *     <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *     <aparte-composer-cancel></aparte-composer-cancel>
 *     <aparte-composer-send></aparte-composer-send>
 *   </div>
 * </aparte-composer>
 */
export class AparteComposerCancel extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _unsubscribes: (() => void)[] = [];

    // Bound handler
    private _onClick = this._handleClick.bind(this);

    connectedCallback(): void {
        this._render();
        this._connectToRoot();
        this._unsubscribes.push(subscribeConfigChange(this, () => this._refreshChrome()));
    }

    disconnectedCallback(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _render(): void {
        if (this.querySelector(`.${CANCEL_BUTTON_CLASS}`)) return;

        const label = resolveConfig(this).t('stopButton') || 'Stop';
        const icon = this._getStopIcon();

        // safe-text: _getStopIcon() returns the provider's SVG markup — escaping it would print the source
        this.innerHTML = controlMarkup({ part: CANCEL_BUTTON_CLASS, label, icon, hidden: true });

        this._button = this.querySelector(`[data-aparte-control="${CANCEL_BUTTON_CLASS}"]`);
        this._button?.addEventListener('click', this._onClick);
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                updateControl(this._button, { hidden: !streaming }, this);
            })
        );

        // Sync initial state
        if (root.streaming) updateControl(this._button, { hidden: false }, this);
    }

    private _handleClick(e: MouseEvent): void {
        e.preventDefault();
        this._getRoot()?.cancel();
    }

    /**
     * Re-read the accessible name and the icon in place.
     *
     * `hidden` is NOT touched: `_render()` always renders this button hidden and only
     * the root's `streaming-change` listener ever un-hides it, so a rebuild would make
     * the stop button vanish in the middle of a turn.
     */
    private _refreshChrome(): void {
        if (!this._button) return;
        const label = resolveConfig(this).t('stopButton') || 'Stop';
        updateControl(this._button, { label, icon: this._getStopIcon() }, this);
    }

    private _getStopIcon(): string {
        return resolveConfig(this).getIcon('stop');
    }
}

if (!customElements.get('aparte-composer-cancel')) {
    customElements.define('aparte-composer-cancel', AparteComposerCancel);
}
