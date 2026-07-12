import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';

/**
 * @element aparte-composer-cancel
 *
 * Cancel/stop streaming button primitive for <aparte-composer>.
 * Must be a descendant of <aparte-composer>.
 *
 * Hidden when not streaming. Visible only during active streaming.
 */
export class AparteComposerCancel extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _unsubscribes: (() => void)[] = [];

    // Bound handler
    private _onClick = this._handleClick.bind(this);

    connectedCallback(): void {
        this._render();
        this._connectToRoot();
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
        if (this.querySelector('.aparte-cc-button')) return;

        const label = resolveConfig(this).t('stopButton' as any) || 'Stop';
        const icon = this._getStopIcon();

        this.innerHTML = `<button
            class="aparte-cc-button"
            aria-label="${label}"
            title="${label}"
            hidden
        >${icon}</button>`;

        this._button = this.querySelector('.aparte-cc-button');
        this._button?.addEventListener('click', this._onClick);
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                if (this._button) this._button.hidden = !streaming;
            })
        );

        // Sync initial state
        if (root.streaming && this._button) this._button.hidden = false;
    }

    private _handleClick(e: MouseEvent): void {
        e.preventDefault();
        this._getRoot()?.cancel();
    }

    private _getStopIcon(): string {
        return resolveConfig(this).getIcon('stop');
    }
}

if (!customElements.get('aparte-composer-cancel')) {
    customElements.define('aparte-composer-cancel', AparteComposerCancel);
}
