import { resolveConfig } from '../../config/index.js';
import type { AparteComposer, AparteComposerPanelMode } from './aparte-composer.js';
import { escapeAttr } from '../../utils/escape.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';

/**
 * Submit button primitive for <aparte-composer>.
 *
 * One control, three meanings: **send**, **stop** while the root is streaming, and — when
 * an elicitation panel is open — **submit** the answer; a panel whose mode is `'none'`
 * (its options settle on the click) takes the button out of the layout entirely. The
 * panel outranks streaming: while one is open the button stays the answer control and a
 * streaming change is ignored. The icon moves with the meaning (paper plane, square,
 * check), because a paper plane that means "answer" is a lie. All three are decided by the root's state
 * — its `value`, `attachments`, `disabled`, `streaming` and the panel payload it
 * broadcasts — not by anything this element owns, which is why it recomputes its chrome
 * rather than re-rendering: a rebuild would put a paper plane back mid-stream, drop out
 * of answer mode, and take the focus off the control most likely to be holding it.
 *
 * "Empty" counts attachments: a pending attachment with no text still enables the
 * button, because that is a message the composer can send.
 *
 * It owns its subtree — the button is generated on connect and children placed inside
 * are replaced, so there is nothing to project. The host element itself is
 * `display: contents`, so it adds no box: the layout comes from whatever flex row you put
 * it in, and the CSS variables below style the inner button.
 *
 * It needs an `<aparte-composer>` ancestor: without one the button renders disabled, no
 * root event ever reaches it, and a click has nothing to submit to.
 *
 * It is not the place to gate on model selection: the opt-in
 * `aparteGlobalConfig.setRequireModelSelection()` gate already blocks this element's
 * pointer events through `aparte-composer[data-model-gated]`.
 *
 * @element aparte-composer-send
 *
 * @cssprop [--aparte-composer-control-size=44px] - Width/height of the button inside the
 *          `.aparte-composer-row` layout helper, shared with the input's single-line
 *          height so the row stays aligned. It wins over `--aparte-send-btn-size` there.
 * @cssprop [--aparte-send-btn-size=36px] - Width/height of the button outside that row
 *          helper. On coarse pointers it is raised to `--aparte-touch-target-size`.
 * @cssprop [--aparte-touch-target-size=44px] - Hit-area floor applied to the button
 *          under `@media (pointer: coarse)`.
 * @cssprop [--aparte-radius-send-btn=6px] - Corner radius of the button.
 * @cssprop --aparte-primary - Button background.
 * @cssprop --aparte-primary-hover - Button background on hover, while enabled.
 * @cssprop --aparte-on-primary - The glyph's colour. Undeclared by default, which means
 *          the recipe derives it from `--aparte-primary` itself, so a theme that changes
 *          the fill gets a readable glyph with no second edit. Declare it to choose one
 *          — it then applies to every primary control, which is the honest scope.
 * @cssprop [--aparte-ink-flip=0.57] - Fill lightness at which the derived ink flips from
 *          dark to light, for every solid control.
 * @cssprop [--aparte-ink-dark=0.176] - How dark that derived ink goes. Not 0: at zero
 *          lightness OKLCH drops the chroma, and the ink loses the fill's own hue.
 * @cssprop --aparte-send-disabled-bg - Background while disabled (falls back to
 *          `--aparte-primary`, which is then dimmed by opacity).
  *
 * @example
 * <!-- One button for both halves of the turn: it submits, and while a reply streams it
 *      becomes the stop button. -->
 * <aparte-composer>
 *   <div class="aparte-composer-row">
 *     <aparte-composer-input></aparte-composer-input>
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
    private _panel: { active: boolean; submitEnabled: boolean; mode: AparteComposerPanelMode } | null = null;

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
            class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-btn--icon aparte-cs-button aparte-send-button"
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
     * Panel open: this one button now means "submit the answer".
     *
     * The icon has to move with the meaning: it drew a paper plane while the label
     * already said "Submit", so it read as "send a message" while it meant "answer
     * this question". It used to draw a chevron too, while a form had questions
     * ahead, and turn into a "Next" — a second way to do what the panel's chips do,
     * and a button whose meaning changed under the pointer. It is disabled instead
     * until every question has an answer, which is what the chips' marks explain.
     */
    private _syncPanelState(): void {
        const panel = this._panel;
        if (!this._button || !panel?.active) return;
        const cfg = resolveConfig(this);
        // No act for this button on this panel: its options settle themselves. The
        // composer's `[data-panel-mode="none"]` rule takes it out of the layout — and
        // `display: none` takes it out of the accessibility tree with it, so there is
        // no `aria-hidden` or `tabindex` to set here and none to restore when the mode
        // flips back. What this branch does is refuse to RELABEL it: leaving it
        // announced as a disabled "Submit" is the lie, not the button.
        if (panel.mode === 'none') {
            this._button.disabled = true;
            return;
        }
        this._button.disabled = !panel.submitEnabled;
        this._button.innerHTML = this._getSubmitIcon();
        const label = cfg.t('submitButton') || 'Submit';
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
