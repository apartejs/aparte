import type { AparteSendEventDetail } from '../../types/index.js';
import { AparteConfig, type AparteConfigClass } from '../../config/aparte-config.js';
import { resolveConfig } from '../../config/config-context.js';

// ─────────────────────────────────────────────────────────────────────────────
// Event map for internal pub/sub between primitives
// ─────────────────────────────────────────────────────────────────────────────
export interface AparteComposerEventMap {
    'value-change': { value: string };
    'streaming-change': { streaming: boolean };
    'disabled-change': { disabled: boolean };
    'attachments-change': { attachments: File[] };
    'submit': { value: string; attachments: File[] };
    'cancel': Record<string, never>;
    'panel-change': { active: boolean; submitEnabled: boolean };
}

export type AparteComposerEventType = keyof AparteComposerEventMap;

/**
 * Public snapshot of the composer's observable state. Delivered on every
 * `aparte:composer-change` DOM event and available synchronously via
 * {@link AparteComposer.getState}. Lets an element OUTSIDE the composer package
 * (a custom send button, a footer control) mirror the composer's live state
 * without the internal `_on`/`_emit` bus.
 */
export interface AparteComposerState {
    value: string;
    streaming: boolean;
    disabled: boolean;
    attachments: File[];
    /** A panel (e.g. an elicitation form) is showing in place of the input. */
    panelActive: boolean;
    /** Whether the send button should act as "submit" while a panel is active. */
    submitEnabled: boolean;
}

/** Detail of the public `aparte:composer-change` DOM event. */
export interface AparteComposerChangeEventDetail {
    state: AparteComposerState;
    composer: AparteComposer;
}

// ─────────────────────────────────────────────────────────────────────────────
// AparteComposer — root context provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @element aparte-composer
 *
 * Root context for all `aparte-composer-*` primitives.
 * Does NOT impose any visual layout — the consumer controls structure.
 *
 * @attr placeholder  - Forwarded to aparte-composer-input via event
 * @attr disabled     - Disables the whole composer
 * @attr target       - ID of the <aparte-chat> target element
 *
 * @fires aparte-send   - Fired when a message is submitted
 */
export class AparteComposer extends HTMLElement {
    private _value = '';
    private _streaming = false;
    private _attachments: File[] = [];
    private _listeners = new Map<string, Set<(payload: any) => void>>();
    private _panelActive = false;
    private _panelSubmitEnabled = false;
    private _panelOnSubmit: (() => void) | null = null;

    // Internal bus events that represent an observable STATE change — these are
    // mirrored to the public `aparte:composer-change` DOM event. `submit`/`cancel`
    // are actions, not state, and are covered by `aparte-send`/`aparte:cancel`.
    private static readonly _STATE_EVENTS: ReadonlySet<AparteComposerEventType> = new Set([
        'value-change', 'streaming-change', 'disabled-change', 'attachments-change', 'panel-change',
    ]);

    // Window event bindings
    private _onMessageStart = this._handleMessageStart.bind(this);
    private _onMessageDone = this._handleMessageDone.bind(this);

    /** Config governing THIS composer (nearest instance boundary, else global). */
    private _cfg: AparteConfigClass = AparteConfig;
    private _configUnsub: (() => void) | null = null;
    /** True while `requireModelSelection` is on AND no model is selected — blocks send. */
    private _modelGated = false;
    private _onConfigChange = (): void => { this._evaluateModelGate(); };

    static get observedAttributes(): string[] {
        return ['placeholder', 'disabled', 'target'];
    }

    connectedCallback(): void {
        window.addEventListener('apartemessagestart', this._onMessageStart);
        window.addEventListener('apartemessagedone', this._onMessageDone);
        window.addEventListener('apartemessageerror', this._onMessageDone);
        window.addEventListener('apartemessageaborted', this._onMessageDone);
        // Model-selection gate (opt-in via AparteConfig.setRequireModelSelection).
        this._cfg = resolveConfig(this);
        this._configUnsub = this._cfg.subscribe(this._onConfigChange);
        this._evaluateModelGate();
    }

    disconnectedCallback(): void {
        window.removeEventListener('apartemessagestart', this._onMessageStart);
        window.removeEventListener('apartemessagedone', this._onMessageDone);
        window.removeEventListener('apartemessageerror', this._onMessageDone);
        window.removeEventListener('apartemessageaborted', this._onMessageDone);
        this._configUnsub?.();
        this._configUnsub = null;
        this._listeners.clear();
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (name === 'disabled') {
            this._emit('disabled-change', { disabled: value !== null });
        }
        if (name === 'placeholder') {
            // Primitives read this directly via closest() — no event needed
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    get value(): string { return this._value; }
    get streaming(): boolean { return this._streaming; }
    get disabled(): boolean { return this.hasAttribute('disabled'); }
    /**
     * When false, Shift+Enter submits and a bare Enter inserts a newline —
     * the inverse of the default. Driven by the `submit-on-enter` attribute.
     */
    get submitOnEnter(): boolean { return this.getAttribute('submit-on-enter') !== 'false'; }
    get attachments(): File[] { return this._attachments; }
    get placeholder(): string { return this.getAttribute('placeholder') ?? ''; }
    get targetId(): string | null { return this.getAttribute('target'); }

    /**
     * Snapshot of the composer's observable state. Pair with the
     * `aparte:composer-change` DOM event to drive a custom send button or footer
     * control that lives outside the composer package:
     *
     * @example
     * // A custom send button. Keep it CLICKABLE while streaming — submit()
     * // routes to cancel() when a response is in flight, so one button is
     * // Send/Stop. Disabling it on `streaming` would make "stop" unreachable.
     * composer.addEventListener('aparte:composer-change', (e) => {
     *   const { streaming, disabled, value, attachments } = e.detail.state;
     *   myButton.textContent = streaming ? 'Stop' : 'Send';
     *   myButton.disabled = disabled || (!streaming && !value.trim() && attachments.length === 0);
     * });
     * myButton.addEventListener('click', () => composer.submit()); // send or stop
     */
    getState(): AparteComposerState {
        return {
            value: this._value,
            streaming: this._streaming,
            disabled: this.disabled,
            attachments: [...this._attachments],
            panelActive: this._panelActive,
            submitEnabled: this._panelSubmitEnabled,
        };
    }

    setValue(value: string): void {
        this._value = value;
        this._emit('value-change', { value });
    }

    addAttachments(files: FileList | File[]): void {
        this._attachments = [...this._attachments, ...Array.from(files)];
        this._emit('attachments-change', { attachments: this._attachments });
    }

    removeAttachment(file: File): void {
        this._attachments = this._attachments.filter(f => f !== file);
        this._emit('attachments-change', { attachments: this._attachments });
    }

    clearAttachments(): void {
        this._attachments = [];
        this._emit('attachments-change', { attachments: [] });
    }

    /** Inject a panel into the composer, hiding the text input. The send button calls onSubmit when clicked. */
    showPanel(panel: HTMLElement, options?: { submitEnabled?: boolean; onSubmit?: () => void }): void {
        this.hidePanel();
        const inputEl = this.querySelector('aparte-composer-input') as HTMLElement | null;
        if (inputEl) inputEl.style.display = 'none';
        panel.dataset['apartePanel'] = 'true';
        if (inputEl) {
            inputEl.insertAdjacentElement('afterend', panel);
        } else {
            this.appendChild(panel);
        }
        this._panelActive = true;
        this._panelSubmitEnabled = options?.submitEnabled ?? false;
        this._panelOnSubmit = options?.onSubmit ?? null;
        this._emit('panel-change', { active: true, submitEnabled: this._panelSubmitEnabled });
    }

    /** Remove the panel and restore the text input. */
    hidePanel(): void {
        const existing = this.querySelector('[data-aparte-panel]') as HTMLElement | null;
        if (existing) existing.remove();
        const inputEl = this.querySelector('aparte-composer-input') as HTMLElement | null;
        if (inputEl) inputEl.style.display = '';
        this._panelActive = false;
        this._panelSubmitEnabled = false;
        this._panelOnSubmit = null;
        this._emit('panel-change', { active: false, submitEnabled: false });
        this.focus();
    }

    /** Update the send button enabled state while a panel is active. */
    setPanelSubmitEnabled(enabled: boolean): void {
        if (!this._panelActive) return;
        this._panelSubmitEnabled = enabled;
        this._emit('panel-change', { active: true, submitEnabled: enabled });
    }

    get panelActive(): boolean { return this._panelActive; }

    /**
     * Recompute the model gate from the resolved config. When
     * `requireModelSelection` is on and no model is selected, block sending and
     * reflect `data-model-gated` so the shipped CSS greys the composer. Re-runs on
     * every config change (e.g. the model selector's auto-select firing).
     */
    private _evaluateModelGate(): void {
        const gated = this._cfg.getRequireModelSelection() && !this._cfg.hasSelectedModel();
        if (gated === this._modelGated) return;
        this._modelGated = gated;
        this.toggleAttribute('data-model-gated', gated);
    }

    /** Submit the current value. Called by aparte-composer-send or programmatically. */
    submit(): void {
        if (this._panelActive) {
            if (this._panelSubmitEnabled) this._panelOnSubmit?.();
            return;
        }
        if (this._streaming) {
            this.cancel();
            return;
        }
        const value = this._value.trim();
        if (!value && this._attachments.length === 0) return;
        if (this.disabled) return;
        if (this._modelGated) return; // no model selected yet (require-model gate)

        this._emit('submit', { value, attachments: this._attachments });

        const detail: AparteSendEventDetail = {
            content: value,
            timestamp: Date.now(),
            targetId: this.targetId ?? undefined,
            files: this._attachments.length > 0 ? [...this._attachments] : undefined,
        };

        this.dispatchEvent(new CustomEvent<AparteSendEventDetail>('aparte-send', {
            bubbles: true,
            composed: true,
            detail,
        }));

        // Clear after send
        this.setValue('');
        this.clearAttachments();
    }

    /** Cancel the current streaming response. */
    cancel(): void {
        this._emit('cancel', {});
        // Public, element-scoped signal — symmetric with `aparte-send` on submit,
        // for consumers that want to observe cancel on the composer itself.
        this.dispatchEvent(new CustomEvent('aparte:cancel', { bubbles: true, composed: true }));
        // aparte:abort → tells AparteClient to actually stop the stream
        // apartemessageaborted → resets the composer's own streaming state
        window.dispatchEvent(new CustomEvent('aparte:abort', { bubbles: false }));
        window.dispatchEvent(new CustomEvent('apartemessageaborted', { bubbles: false }));
    }

    /**
     * Reset the composer to its initial state.
     * Clears value, attachments, and hides any active panel.
     * Call this when switching conversations.
     */
    reset(): void {
        this.setValue('');
        this.clearAttachments();
        if (this._panelActive) this.hidePanel();
    }

    /** Focus the input primitive inside this composer. */
    override focus(): void {
        const input = this.querySelector('aparte-composer-input') as HTMLElement | null;
        input?.focus();
    }

    // ── Internal pub/sub ────────────────────────────────────────────────────

    _emit<K extends AparteComposerEventType>(event: K, payload: AparteComposerEventMap[K]): void {
        this._listeners.get(event)?.forEach(cb => cb(payload));
        // Mirror state changes to a public DOM event so elements outside the
        // composer package can observe them without the private bus.
        if (AparteComposer._STATE_EVENTS.has(event)) {
            this.dispatchEvent(new CustomEvent<AparteComposerChangeEventDetail>('aparte:composer-change', {
                bubbles: true,
                composed: true,
                detail: { state: this.getState(), composer: this },
            }));
        }
    }

    _on<K extends AparteComposerEventType>(event: K, cb: (payload: AparteComposerEventMap[K]) => void): () => void {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event)!.add(cb as any);
        return () => this._listeners.get(event)?.delete(cb as any);
    }

    // ── Window events ───────────────────────────────────────────────────────

    private _handleMessageStart(): void {
        this._streaming = true;
        this._emit('streaming-change', { streaming: true });
    }

    private _handleMessageDone(): void {
        this._streaming = false;
        this._emit('streaming-change', { streaming: false });
        // Always hide any active panel when a message lifecycle ends
        if (this._panelActive) this.hidePanel();
    }
}

if (!customElements.get('aparte-composer')) {
    customElements.define('aparte-composer', AparteComposer);
}
