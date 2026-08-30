import { resolveConfig, type AparteIconName } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';
import { escapeAttr } from '../../utils/escape.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';

/**
 * Generic action button primitive for <aparte-composer>.
 *
 * The consumer declares it directly in markup — no global registration needed.
 *
 * It is the escape hatch for a button core has no opinion about: it renders one icon
 * button wearing `.aparte-action-button` (the shared icon-button look — colour from
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
 * A child already carrying `class="aparte-cact-button"` suppresses core's own render — and
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
 *   `.aparte-action-button` itself, which wins over a value inherited from your theme.
 * @cssprop [--aparte-input-action-btn-icon-size=20px] - Size of the `<svg>` inside it.
 * @cssprop [--aparte-radius-action-btn=var(--aparte-radius-sm)] - Corner radius.
 *
 * @example
 * <!-- Inside a composer, because that is what it resolves with `closest()`. `action-id`
 *      is what tells two custom buttons apart: it comes back on the event's detail, and
 *      a second button without one is indistinguishable from the first. -->
 * <aparte-composer>
 *   <div class="aparte-composer-shell">
 *     <div class="aparte-composer-row">
 *       <aparte-composer-input></aparte-composer-input>
 *       <aparte-composer-action icon="star" label="Favourite" action-id="favourite"></aparte-composer-action>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *   </div>
 * </aparte-composer>
 *
 * <script>
 *   // The event bubbles, so one listener above the composer serves every action.
 *   document.addEventListener('aparte-action-click', (event) => {
 *     if (event.detail.actionId === 'favourite') console.log('starred');
 *   });
 * </script>
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
        // Bound here, never in _render — disconnect removes it and a reconnect's
        // _render keeps the existing DOM (see aparte-composer-input for the full rule).
        this._button = this.querySelector('.aparte-cact-button');
        this._button?.addEventListener('click', this._onClick);
        this._connectToRoot();
        // Icon only, and no locale: this element's label is the consumer's `label`
        // ATTRIBUTE, so the app owns that string and a locale change is correctly a
        // no-op here. The write is the same one `attributeChangedCallback` does for
        // the `icon` attribute — `_resolveIcon` already decides between a provider
        // key and raw markup, so calling it again is idempotent.
        this._unsubscribes.push(subscribeConfigChange(this, () => {
            if (this._button) this._button.innerHTML = this._resolveIcon(this.getAttribute('icon') ?? '');
        }));
    }

    disconnectedCallback(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (!this._button) return;
        if (name === 'disabled') {
            this._button.disabled = value !== null;
        }
        if (name === 'label') {
            this._button.setAttribute('aria-label', value ?? '');
            this._button.setAttribute('title', value ?? '');
        }
        if (name === 'icon') {
            this._button.innerHTML = this._resolveIcon(value ?? '');
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _render(): void {
        if (this.querySelector('.aparte-cact-button')) return;

        // `label` is a host-set attribute (often bound to dynamic/translated
        // text by the consumer) — escape before it lands in a double-quoted
        // attribute so a stray `"` can't break out and inject markup.
        const label = escapeAttr(this.getAttribute('label') ?? '');
        const icon = this._resolveIcon(this.getAttribute('icon') ?? '');  // safe-text: _resolveIcon returns provider SVG, or the host-set icon attribute verbatim when it starts with < — documented as trusted markup, same contract as AparteIconProvider
        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;

        this.innerHTML = `<button
            class="aparte-btn aparte-btn--icon aparte-cact-button aparte-action-button"
            aria-label="${label}"
            title="${label}"
            type="button"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;

    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('disabled-change', ({ disabled }) => {
                if (this._button) this._button.disabled = disabled || this.hasAttribute('disabled');
            })
        );
        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                if (this._button) this._button.disabled = streaming || root.disabled || this.hasAttribute('disabled');
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
