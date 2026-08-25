import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';
import { escapeAttr } from '../../utils/escape.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';

/**
 * Submit button primitive for <aparte-composer>.
 *
 * @element aparte-composer-send
 * Must be a descendant of <aparte-composer>.
 *
 * - Disabled when composer value is empty, composer is disabled, or streaming
 * - While streaming: shows stop icon and acts as cancel button
  *
 * @example
 * <!-- One button for both halves of the turn: it submits, and while a reply streams it
 *      becomes the stop button. Do not disable it on `streaming` or stop is unreachable. -->
 * <aparte-composer>
 *   <div class="aparte-composer-row">
 *     <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *     <aparte-composer-send></aparte-composer-send>
 *   </div>
 * </aparte-composer>
 */
export class AparteComposerSend extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _unsubscribes: (() => void)[] = [];
    /**
     * The last `panel-change` payload.
     *
     * This button has four meanings — send, stop, submit an answer, advance to the
     * next question — and three of them are decided by state it does not own: the
     * root's `streaming`, and this payload. It was read straight out of the event's
     * arguments and thrown away, so nothing could recompute the button's chrome
     * afterwards; a config change had no way to know which of the four to write.
     */
    private _panel: { active: boolean; submitEnabled: boolean; mode: 'advance' | 'submit' } | null = null;

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
            aria-label="${escapeAttr(label)}"
            title="${escapeAttr(label)}"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;  // safe-text: _getSendIcon() returns the provider's SVG markup — escaping it would print the source

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
            root._on('panel-change', (payload) => {
                this._panel = payload;
                this._refreshChrome();
            })
        );
        // A config change — a new icon set, another language — has to write the
        // chrome for whichever of the four meanings the button currently carries.
        this._unsubscribes.push(subscribeConfigChange(this, () => this._refreshChrome()));
    }

    /**
     * Write the chrome for the mode the button is IN, deciding before writing.
     *
     * Never `_render()`: it returns early once the button exists, and its own
     * disabled/icon computation consults neither `root.streaming` nor the panel — so
     * rebuilding mid-turn would put a paper plane back while a reply was still
     * streaming, and rebuilding with the question panel open would silently drop out
     * of answer mode. It would also take the focus off the one control in this
     * composer most likely to be holding it.
     */
    private _refreshChrome(): void {
        if (!this._button) return;
        if (this._panel?.active) { this._syncPanelState(); return; }
        if (this._getRoot()?.streaming) { this._syncStreamingState(true); return; }
        this._syncState();
    }

    /**
     * Panel open: this one button now means "answer", and WHICH answer depends on
     * where you are in the form.
     *
     * The icon has to move with the meaning: it drew a paper plane while the label
     * already said "Submit", so it read as "send a message" while it meant "answer
     * this question". And a check on a form with three questions left was just as
     * wrong — hence a chevron while there is more ahead. The visual is what a user
     * reads.
     */
    private _syncPanelState(): void {
        const panel = this._panel;
        if (!this._button || !panel?.active) return;
        const cfg = resolveConfig(this);
        const advancing = panel.mode === 'advance';
        this._button.disabled = !panel.submitEnabled;
        this._button.innerHTML = advancing ? cfg.getIcon('nextBranch') : this._getSubmitIcon();
        const label = advancing
            ? (cfg.t('elicitationNext') || 'Next')
            : (cfg.t('submitButton') || 'Submit');
        this._button.setAttribute('aria-label', label);
        this._button.setAttribute('title', label);
        this._button.classList.remove('aparte-is-streaming');
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
        this._button.classList.remove('aparte-is-streaming');
    }

    private _syncStreamingState(streaming: boolean): void {
        if (!this._button) return;
        if (streaming) {
            this._button.disabled = false;
            this._button.innerHTML = this._getStopIcon();
            // Was the bare literal 'Stop', so no locale could reach it — the same
            // gap `aparte-composer-cancel` had, on a second element. The key is
            // declared now.
            const label = resolveConfig(this).t('stopButton') || 'Stop';
            this._button.setAttribute('aria-label', label);
            this._button.setAttribute('title', label);
            this._button.classList.add('aparte-is-streaming');
        } else {
            this._syncState();
        }
    }

    /**
     * The icon for submitting an ANSWER, which is not the same act as sending a
     * message — one button, two meanings, and it has to say which one it is.
     */
    private _getSubmitIcon(): string {
        // No fallback chain: `getIcon` already returns a built-in when the consumer's
        // icon set has no entry, so `|| getIcon('send')` was dead code — written on the
        // assumption that it could come back empty, and a test proved it cannot.
        return resolveConfig(this).getIcon('check');
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
