import { resolveConfig, type AparteIconName } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';

/**
 * @element aparte-composer-action
 *
 * Generic action button primitive for <aparte-composer>.
 * The consumer declares it directly in markup — no global registration needed.
 *
 * @attr icon      - Icon key for AparteConfig.getIcon(), or raw SVG/HTML starting with `<`
 * @attr label     - Accessible label (also used as tooltip)
 * @attr disabled  - Disables the button
 *
 * @fires aparte-action-click - Bubbles up when the button is clicked
 *                            detail: { actionId: string, composer: AparteComposer | null }
 *
 * @slot default - Optional: override button content entirely
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
        const label = this._escapeAttr(this.getAttribute('label') ?? '');
        const icon = this._resolveIcon(this.getAttribute('icon') ?? '');
        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;

        this.innerHTML = `<button
            class="aparte-cact-button aparte-action-button"
            aria-label="${label}"
            title="${label}"
            type="button"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;

        this._button = this.querySelector('.aparte-cact-button');
        this._button?.addEventListener('click', this._onClick);
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
        this.dispatchEvent(new CustomEvent('aparte-action-click', {
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

    /** Escape a value before it lands in a double-quoted HTML attribute. */
    private _escapeAttr(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}

if (!customElements.get('aparte-composer-action')) {
    customElements.define('aparte-composer-action', AparteComposerAction);
}
