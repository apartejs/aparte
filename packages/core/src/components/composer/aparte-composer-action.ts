import { resolveConfig, type AparteIconName } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';
import { controlMarkup, updateControl } from '../../utils/control.js';

/**
 * This element's button. A child already carrying it suppresses core's own render,
 * so the name is a published contract — see `utils/control.ts` for why it is spelled
 * out rather than initialled.
 */
const ACTION_BUTTON_CLASS = 'aparte-composer-action__button';


/**
 * Generic action button, a part of <aparte-composer>.
 *
 * The consumer declares it directly in markup — no global registration needed.
 *
 * It is the escape hatch for a button core has no opinion about: it renders one icon
 * button wearing `.aparte-control` (the shared icon-button look — colour from
 * `--aparte-neutral`, hover tint derived from `--aparte-primary`) and emits
 * `aparte-action-click`. It carries no behaviour of its own and nothing in core listens
 * for that event, so the app is the only thing that can make it do something. Prefer the
 * dedicated element wherever one exists — `<aparte-composer-send>`,
 * `<aparte-composer-cancel>`, `<aparte-composer-add-attachment>` — since those already
 * talk to the composer.
 *
 * The host is `display: contents`, so the `<button>` rather than this element is the flex
 * child of the surrounding `.aparte-composer-row`. It subscribes to the nearest composer's
 * `disabled` and `streaming` changes, so it greys out while a turn is running without the
 * app tracking that. Used outside a composer it still mounts and still fires, with
 * `composer: null` in the detail.
 *
 * A child already carrying `class="aparte-composer-action__button"` suppresses core's own render — and
 * core then wires nothing to it: no click listener (so no `aparte-action-click`), no
 * `label` → `aria-label`/`title` write, no `icon` write, no disabled/streaming sync. Take
 * that path only for a button your own code drives end to end. Any other child is replaced
 * on the first render.
 *
 * @element aparte-composer-action
 *
 * @attr {string} icon - Icon key for aparteGlobalConfig.getIcon(), or raw SVG/HTML starting with `<`
 * @attr {string} label - Accessible label (also used as tooltip)
 * @attr {boolean} disabled - Disables the button
 * @attr {string} action-id - Identifies WHICH button fired; carried as
 *   `AparteActionClickEventDetail.actionId`. Read lazily at dispatch time rather than
 *   observed, so changing it takes effect on the next click.
 *
 * @fires {CustomEvent<AparteActionClickEventDetail>} aparte-action-click - Bubbles up when
 *   the button is clicked, carrying which button it was and the composer it belongs to.
 *   The type argument is not decoration: a BARE `@fires` records `CustomEvent` with no
 *   argument, and the bindings generator then emits `EventEmitter<void>` with a
 *   listener that drops `$event` — so an Angular consumer with two custom buttons
 *   could not tell which one fired.
 *                            detail: { actionId: string, composer: AparteComposer | null }
 *
 * @cssprop [--aparte-input-action-btn-size=36px] - Square size of the button. On a coarse
 *   pointer the stylesheet re-sets it to `--aparte-touch-target-size` (44px) on
 *   `.aparte-control` itself, which wins over a value inherited from your theme.
 * @cssprop [--aparte-input-action-btn-icon-size=20px] - Size of the `<svg>` inside it.
 * @cssprop [--aparte-radius-action-btn=var(--aparte-radius-sm)] - Corner radius.
 *
 * @example
 * <aparte-composer-action icon="star" label="Favourite"
 *   (click)="onFavourite()">
 * </aparte-composer-action>
 */
export class AparteComposerAction extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _unsubscribes: (() => void)[] = [];

    // Bound handler
    private _onClick = this._handleClick.bind(this);

    static get observedAttributes(): string[] {
        return ['icon', 'label', 'disabled'];
    }

    connectedCallback(): void {
        this._render();
        this._connectToRoot();
        // Icon only, and no locale: this element's label is the consumer's `label`
        // ATTRIBUTE, so the app owns that string and a locale change is correctly a
        // no-op here. The write is the same one `attributeChangedCallback` does for
        // the `icon` attribute — `_resolveIcon` already decides between a provider
        // key and raw markup, so calling it again is idempotent.
        this._unsubscribes.push(subscribeConfigChange(this, () => {
            updateControl(this._button, { icon: this._resolveIcon(this.getAttribute('icon') ?? '') }, this);
        }));
    }

    disconnectedCallback(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (!this._button) return;
        if (name === 'disabled') updateControl(this._button, { disabled: value !== null }, this);
        if (name === 'label') updateControl(this._button, { label: value ?? '' }, this);
        if (name === 'icon') updateControl(this._button, { icon: this._resolveIcon(value ?? '') }, this);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _render(): void {
        if (this.querySelector(`.${ACTION_BUTTON_CLASS}`)) return;

        // `label` is a host-set attribute (often bound to dynamic/translated text by the
        // consumer). The `escapeAttr` call that used to wrap it is gone rather than kept:
        // `controlMarkup` escapes whatever it puts in an attribute, so escaping here too
        // would double it and print `&amp;` in a tooltip.
        const label = this.getAttribute('label') ?? '';
        const icon = this._resolveIcon(this.getAttribute('icon') ?? '');  // safe-text: _resolveIcon returns provider SVG, or the host-set icon attribute verbatim when it starts with < — documented as trusted markup, same contract as AparteIconProvider
        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;

        this.innerHTML = controlMarkup({
            part: ACTION_BUTTON_CLASS, look: 'icon', label, icon, disabled,
        });

        this._button = this.querySelector(`[data-aparte-control="${ACTION_BUTTON_CLASS}"]`);
        this._button?.addEventListener('click', this._onClick);
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('disabled-change', ({ disabled }) => {
                updateControl(this._button, { disabled: disabled || this.hasAttribute('disabled') }, this);
            })
        );
        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                updateControl(this._button, { disabled: streaming || root.disabled || this.hasAttribute('disabled') }, this);
            })
        );
    }

    private _handleClick(_e: MouseEvent): void {
        this.dispatchEvent(new CustomEvent<AparteActionClickEventDetail>('aparte-action-click', {
            bubbles: true,
            composed: true,
            detail: { actionId: this.getAttribute('action-id') ?? '', composer: this._getRoot() },
        }));
    }

    private _resolveIcon(icon: string): string {
        if (!icon) return '';
        if (icon.trimStart().startsWith('<')) return icon;
        return resolveConfig(this).getIcon(icon as AparteIconName) ?? icon;
    }
}

if (!customElements.get('aparte-composer-action')) {
    customElements.define('aparte-composer-action', AparteComposerAction);
}

/**
 * Detail payload for `aparte-action-click`.
 *
 * `<aparte-composer-action>` is a publicly exported element whose only purpose is
 * to emit this event, and nothing in core listens for it — so the app IS the
 * consumer, and it had no type to read `e.detail` with. The shape was already
 * published in prose in the generated API reference; this makes it compile.
 *
 * @event aparte-action-click
 */
export interface AparteActionClickEventDetail {
    /** The `action-id` attribute of the button that was clicked, or `''`. */
    actionId: string;
    /** The owning composer, or `null` when the button is used outside one. */
    composer: AparteComposer | null;
}
