import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';

/**
 * @element aparte-composer-send
 *
 * Submit button primitive for <aparte-composer>.
 * Must be a descendant of <aparte-composer>.
 *
 * - Disabled when composer value is empty, composer is disabled, or streaming
 * - While streaming: shows stop icon and acts as cancel button
 */
export class AparteComposerSend extends HTMLElement {
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
        if (this.querySelector('.aparte-cs-button')) return;

        const label = resolveConfig(this).t('sendButton') || 'Send';
        const icon = this._getSendIcon();
        const root = this._getRoot();
        const disabled = !root || root.disabled || root.value.trim() === '';

        this.innerHTML = `<button
            class="aparte-cs-button aparte-send-button"
            aria-label="${label}"
            title="${label}"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;

        this._button = this.querySelector('.aparte-cs-button');
        this._button?.addEventListener('click', this._onClick);
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('value-change', () => this._syncState())
        );
        this._unsubscribes.push(
            root._on('disabled-change', () => this._syncState())
        );
        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                // If panel is active, streaming state change doesn't affect the button —
                // the panel controls it (submit answer, not stop stream)
                if (this._getRoot()?.panelActive) return;
                this._syncStreamingState(streaming);
            })
        );
        this._unsubscribes.push(
            root._on('attachments-change', () => this._syncState())
        );
        this._unsubscribes.push(
            root._on('panel-change', ({ active, submitEnabled }) => {
                if (!this._button) return;
                if (active) {
                    // Panel is shown — override to "Submit answer" state regardless of streaming
                    this._button.disabled = !submitEnabled;
                    this._button.innerHTML = this._getSendIcon();
                    const label = resolveConfig(this).t('submitButton') || 'Submit';
                    this._button.setAttribute('aria-label', label);
                    this._button.setAttribute('title', label);
                    this._button.classList.remove('is-streaming');
                } else {
                    // Panel closed — restore state based on current streaming
                    const root = this._getRoot();
                    if (root?.streaming) {
                        this._syncStreamingState(true);
                    } else {
                        this._syncState();
                    }
                }
            })
        );
    }

    private _handleClick(e: MouseEvent): void {
        e.preventDefault();
        this._getRoot()?.submit();
    }

    private _syncState(): void {
        const root = this._getRoot();
        if (!root || !this._button) return;
        if (root.streaming) return; // streaming state managed separately

        const isEmpty = root.value.trim() === '' && root.attachments.length === 0;
        this._button.disabled = root.disabled || isEmpty;
        this._button.innerHTML = this._getSendIcon();
        const label = resolveConfig(this).t('sendButton') || 'Send';
        this._button.setAttribute('aria-label', label);
        this._button.setAttribute('title', label);
        this._button.classList.remove('is-streaming');
    }

    private _syncStreamingState(streaming: boolean): void {
        if (!this._button) return;
        if (streaming) {
            this._button.disabled = false;
            this._button.innerHTML = this._getStopIcon();
            this._button.setAttribute('aria-label', 'Stop');
            this._button.setAttribute('title', 'Stop');
            this._button.classList.add('is-streaming');
        } else {
            this._syncState();
        }
    }

    private _getSendIcon(): string {
        return resolveConfig(this).getIcon('send') || 'Send';
    }

    private _getStopIcon(): string {
        return resolveConfig(this).getIcon('stop');
    }
}

if (!customElements.get('aparte-composer-send')) {
    customElements.define('aparte-composer-send', AparteComposerSend);
}
