import type { AparteSendEventDetail, AparteInputConfig, AparteActionEventDetail } from '../../types/index.js';
import { resolveConfig } from '../../config/index.js';

/**
 * AparteChatInput — Legacy monolithic chat input component.
 *
 * @element aparte-chat-input
 * @attr {string} placeholder - Placeholder text
 * @attr {string} max-height - Maximum height in pixels
 * @attr {string} min-height - Minimum height in pixels
 * @attr {boolean} disabled - Disable input
 *
 * @fires aparte-send - Fired when the user submits a message
 *
 * @deprecated Use the `<aparte-composer>` primitives instead.
 *
 * **Migration:**
 * ```html
 * <!-- Before -->
 * <aparte-chat-input placeholder="Ask anything…">
 *   <aparte-model-selector slot="footer-left"></aparte-model-selector>
 * </aparte-chat-input>
 *
 * <!-- After -->
 * <aparte-composer placeholder="Ask anything…">
 *   <aparte-composer-attachments></aparte-composer-attachments>
 *   <div class="my-input-row">
 *     <aparte-composer-add-attachment></aparte-composer-add-attachment>
 *     <aparte-composer-input></aparte-composer-input>
 *     <aparte-composer-send></aparte-composer-send>
 *   </div>
 *   <div class="my-footer">
 *     <aparte-model-selector></aparte-model-selector>
 *   </div>
 * </aparte-composer>
 * ```
 * The `aparte-send` CustomEvent detail shape (`AparteSendEventDetail`) is identical —
 * no changes needed on the listener side.
 */
export class AparteChatInput extends HTMLElement {
    /** Contenteditable div reference */
    private _editor: HTMLDivElement | null = null;

    /** Send button reference */
    private _sendButton: HTMLButtonElement | null = null;

    /** Maximum height for auto-expand */
    private _maxHeight = 200;

    /** Minimum height */
    private _minHeight = 44;

    /** Placeholder text */
    private _placeholder = 'Type a message...';

    /** Whether the AI is currently streaming (shows Stop button) */
    private _isStreaming = false;

    /** MutationObserver watching for late-arriving slot children */
    private _slotObserver: MutationObserver | null = null;

    /** Whether a plugin panel is currently mounted (replaces the editor) */
    private _panelActive = false;

    /** Whether the send button should be enabled while a panel is active */
    private _panelSubmitEnabled = false;

    /** Callback invoked when the send button is clicked while a panel is active */
    private _panelOnSubmit: (() => void) | null = null;

    /** Bound window event handlers for lifecycle events */
    private _onMessageStart = this._handleMessageStart.bind(this);
    private _onMessageDone = this._handleMessageDone.bind(this);
    /** Unsubscribe from AparteConfig changes */
    private _configUnsubscribe: (() => void) | null = null;

    static get observedAttributes(): string[] {
        return ['placeholder', 'max-height', 'min-height', 'disabled'];
    }

    constructor() {
        super();
        this._handleInput = this._handleInput.bind(this);
        this._handleKeydown = this._handleKeydown.bind(this);
        this._handleSendClick = this._handleSendClick.bind(this);
        this._handleFocus = this._handleFocus.bind(this);
        this._handleBlur = this._handleBlur.bind(this);
        this._handlePaste = this._handlePaste.bind(this);
    }

    connectedCallback(): void {
        this._render();
        this._setupEventListeners();
        this._setupSlotObserver();
        window.addEventListener('aparte-message-start', this._onMessageStart);
        window.addEventListener('aparte-message-done', this._onMessageDone);
        window.addEventListener('aparte-message-error', this._onMessageDone);
        window.addEventListener('aparte-message-aborted', this._onMessageDone);
        this._configUnsubscribe = resolveConfig(this).subscribe(() => this._updateActionVisibility());
    }

    disconnectedCallback(): void {
        this._editor?.removeEventListener('input', this._handleInput);
        this._editor?.removeEventListener('keydown', this._handleKeydown);
        this._editor?.removeEventListener('focus', this._handleFocus);
        this._editor?.removeEventListener('blur', this._handleBlur);
        this._editor?.removeEventListener('paste', this._handlePaste);
        this._sendButton?.removeEventListener('click', this._handleSendClick);
        window.removeEventListener('aparte-message-start', this._onMessageStart);
        window.removeEventListener('aparte-message-done', this._onMessageDone);
        window.removeEventListener('aparte-message-error', this._onMessageDone);
        window.removeEventListener('aparte-message-aborted', this._onMessageDone);
        this._configUnsubscribe?.();
        this._configUnsubscribe = null;
        this._slotObserver?.disconnect();
        this._slotObserver = null;
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;

        switch (name) {
            case 'placeholder':
                this._placeholder = newValue || 'Type a message...';
                this._updatePlaceholder();
                break;
            case 'max-height':
                this._maxHeight = parseInt(newValue || '200', 10);
                this._adjustHeight();
                break;
            case 'min-height':
                this._minHeight = parseInt(newValue || '44', 10);
                this._adjustHeight();
                break;
            case 'disabled':
                this._updateDisabledState(newValue !== null);
                break;
        }
    }

    /**
     * Configure input with options
     */
    configure(config: AparteInputConfig): void {
        if (config.placeholder !== undefined) {
            this.setAttribute('placeholder', config.placeholder);
        }
        if (config.maxHeight !== undefined) {
            this._maxHeight = config.maxHeight;
            this.setAttribute('max-height', String(config.maxHeight));
        }
        if (config.minHeight !== undefined) {
            this._minHeight = config.minHeight;
            this.setAttribute('min-height', String(config.minHeight));
        }
    }

    /**
     * Get current value (plain text)
     */
    getValue(): string {
        return this._editor?.textContent?.trim() || '';
    }

    /**
     * Get current value as HTML
     */
    getHtmlValue(): string {
        return this._editor?.innerHTML || '';
    }

    /**
     * Set value (plain text)
     */
    setValue(value: string): void {
        if (this._editor) {
            this._editor.textContent = value;
            this._updatePlaceholderVisibility();
            this._adjustHeight();
        }
    }

    /**
     * Set value as HTML
     */
    setHtmlValue(html: string): void {
        if (this._editor) {
            this._editor.innerHTML = html;
            this._updatePlaceholderVisibility();
            this._adjustHeight();
        }
    }

    /**
     * Clear input
     */
    clear(): void {
        if (this._editor) {
            this._editor.innerHTML = '';
            this._updatePlaceholderVisibility();
            this._adjustHeight();
        }
    }

    /**
     * Focus the editor
     */
    override focus(): void {
        this._editor?.focus();
    }

    /**
     * Blur the editor
     */
    override blur(): void {
        this._editor?.blur();
    }

    /**
     * Mount an arbitrary HTMLElement inside the input wrapper, hiding the editor.
     * Used by plugins (e.g. ask-question) to turn the input area into a picker.
     *
     * @param panel - The element to mount.
     * @param options.submitEnabled - Whether the send button should be enabled immediately.
     * @param options.onSubmit - Callback invoked when the send button is clicked.
     *
     * Call hidePanel() to restore the normal input.
     */
    showPanel(panel: HTMLElement, options?: { submitEnabled?: boolean; onSubmit?: () => void }): void {
        const wrapper = this.querySelector('.aparte-input-wrapper');
        if (!wrapper) return;
        // Remove any existing panel first
        this.hidePanel();
        // Hide only the editor — send button stays visible and acts as confirm
        const editorContainer = wrapper.querySelector('.aparte-input-container') as HTMLElement | null;
        if (editorContainer) editorContainer.style.display = 'none';
        // Inject panel before the right-actions so send button stays on the right
        panel.dataset['apartePanel'] = 'true';
        const actionsRight = wrapper.querySelector('.aparte-actions-right');
        wrapper.insertBefore(panel, actionsRight ?? null);
        // Activate panel-mode — this makes _updateSendButtonState ignore isEmpty
        this._panelActive = true;
        this._panelSubmitEnabled = options?.submitEnabled ?? false;
        this._panelOnSubmit = options?.onSubmit ?? null;
        this._updateSendButtonState();
    }

    /**
     * Remove a panel previously mounted with showPanel() and restore the editor.
     */
    hidePanel(): void {
        const wrapper = this.querySelector('.aparte-input-wrapper');
        if (!wrapper) return;
        const existing = wrapper.querySelector('[data-aparte-panel]');
        if (existing) existing.remove();
        const editorContainer = wrapper.querySelector('.aparte-input-container') as HTMLElement | null;
        if (editorContainer) editorContainer.style.display = '';
        // Reset panel-mode state
        this._panelActive = false;
        this._panelSubmitEnabled = false;
        this._panelOnSubmit = null;
        this._updateSendButtonState();
        // Restore focus so the user can type immediately
        this._editor?.focus();
    }

    /**
     * Update the send button's enabled state while a panel is active.
     * No-op if no panel is currently mounted.
     */
    setPanelSubmitEnabled(enabled: boolean): void {
        if (!this._panelActive) return;
        this._panelSubmitEnabled = enabled;
        this._updateSendButtonState();
    }

    private _render(): void {
        const placeholder = this.getAttribute('placeholder') || 'Type a message...';
        this._placeholder = placeholder;
        const disabled = this.hasAttribute('disabled');
        const sendLabel = resolveConfig(this).t('sendButton');
        const inputLabel = resolveConfig(this).t('inputPlaceholder');

        const actions = resolveConfig(this).getActions('composer');
        const rightActions = actions.filter(a => a.composer?.position === 'right');
        const leftActions = actions.filter(a => a.composer?.position !== 'right');

        // Re-entrancy check
        if (this.querySelector('.aparte-input-shell')) return;

        // Collect all slotted children generically before wiping innerHTML
        const slottedChildren = Array.from(this.children)
            .filter(el => el.getAttribute('slot'))
            .map(el => ({ slotName: el.getAttribute('slot')!, el }));

        this.innerHTML = `
      <div class="aparte-input-shell">
        <div class="aparte-input-upper" data-slot="upper"></div>
        <div class="aparte-input-wrapper">
          <div class="aparte-actions-left">
              ${leftActions.map(action => this._renderActionButton(action)).join('')}
          </div>

          <div class="aparte-input-container">
            <div
              class="aparte-editor"
              contenteditable="${!disabled}"
              role="textbox"
              aria-multiline="true"
              aria-label="${inputLabel}"
              tabindex="0"
              aria-disabled="${disabled}"
              data-placeholder="${placeholder || inputLabel}"
            ></div>
          </div>

          <div class="aparte-actions-right">
              ${rightActions.map(action => this._renderActionButton(action)).join('')}
              <button
                  class="aparte-send-button"
                  aria-label="${sendLabel}"
                  title="${sendLabel}"
                  ${disabled ? 'disabled' : ''}
              >
                  ${this._getSendIcon()}
              </button>
          </div>
        </div>
        <div class="aparte-input-footer" data-slot-container="footer">
          <div class="aparte-footer-slot start" data-slot="footer-left"></div>
          <div class="aparte-footer-slot center" data-slot="footer-center"></div>
          <div class="aparte-footer-slot end" data-slot="footer-right"></div>
        </div>
      </div>
    `;

        // Generic slot routing
        slottedChildren.forEach(({ slotName, el }) => {
            const container = this.querySelector(`[data-slot="${slotName}"]`);
            if (container) container.appendChild(el);
        });

        // Sync zone visibility after routing
        this._updateZoneVisibility('upper');
        this._updateZoneVisibility('footer');


        this._editor = this.querySelector('.aparte-editor');
        this._sendButton = this.querySelector('.aparte-send-button');

        // Bind action click handlers — emit the declarative `aparte-action` event
        // (framework-agnostic, like retry/feedback) and call the optional onClick.
        actions.forEach(action => {
            const btn = this.querySelector(`[data-action-id="${action.id}"]`);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    this.dispatchEvent(new CustomEvent<AparteActionEventDetail>('aparte-action', {
                        bubbles: true,
                        composed: true,
                        detail: { actionId: action.id, zone: 'composer' },
                    }));
                    action.onClick?.(e, this);
                });
            }
        });

        // Initial state update
        this._updateSendButtonState();
        this._adjustHeight();
    }

    private _renderActionButton(action: import('../../config/action-provider.js').AparteAction): string {
        // 1. Raw HTML/SVG: use directly
        // 2. Provider key: try AparteConfig.getIcon()
        // 3. iconFallback: use if provider doesn't have the key
        // 4. Last resort: first char of id
        let iconHtml: string;
        if (action.icon.trimStart().startsWith('<')) {
            iconHtml = action.icon;
        } else {
            iconHtml = resolveConfig(this).getIcon(action.icon as any)
                || action.iconFallback
                || action.id.charAt(0);
        }
        const label = resolveConfig(this).t(action.label as any) || action.label;

        return `
            <button class="aparte-action-button" data-action-id="${action.id}" title="${label}" aria-label="${label}"${action.composer?.hidden ? ' style="display:none"' : ''}>
                ${iconHtml}
            </button>
        `;
    }

    /** Reactively sync action button visibility after a config change (no full re-render). */
    private _updateActionVisibility(): void {
        const actions = resolveConfig(this).getActions('composer');
        actions.forEach(action => {
            const btn = this.querySelector(`[data-action-id="${action.id}"]`) as HTMLElement | null;
            if (btn) btn.style.display = action.composer?.hidden ? 'none' : '';
        });
    }

    /** Get send icon */
    private _getSendIcon(): string {
        return resolveConfig(this).getIcon('send') || 'Send';
    }

    /** Get stop icon (square) */
    private _getStopIcon(): string {
        return resolveConfig(this).getIcon('stop');
    }

    private _setupEventListeners(): void {
        this._editor?.addEventListener('input', this._handleInput);
        this._editor?.addEventListener('keydown', this._handleKeydown);
        this._editor?.addEventListener('focus', this._handleFocus);
        this._editor?.addEventListener('blur', this._handleBlur);
        this._editor?.addEventListener('paste', this._handlePaste);
        this._sendButton?.addEventListener('click', this._handleSendClick);
    }

    private _setupSlotObserver(): void {
        this._slotObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Handle added nodes
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    const el = node as Element;
                    const slotName = el.getAttribute('slot');
                    if (!slotName) return;
                    const container = this.querySelector(`[data-slot="${slotName}"]`);
                    if (container) {
                        container.appendChild(el);
                        this._updateZoneVisibility(this._zoneForSlot(slotName));
                    }
                });
                // Handle removed nodes
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    const el = node as Element;
                    const slotName = el.getAttribute('slot');
                    if (!slotName) return;
                    this._updateZoneVisibility(this._zoneForSlot(slotName));
                });
            }
        });
        this._slotObserver.observe(this, { childList: true });
    }

    /** Map a slot name to its zone class for visibility checks. */
    private _zoneForSlot(slotName: string): string {
        if (slotName === 'upper') return 'upper';
        if (slotName.startsWith('footer')) return 'footer';
        return slotName;
    }

    /**
     * Show/hide a zone based on whether it has any children.
     * Zone 'upper'  → .aparte-input-upper
     * Zone 'footer' → .aparte-input-footer
     */
    private _updateZoneVisibility(zone: string): void {
        let zoneEl: HTMLElement | null = null;
        if (zone === 'upper') {
            zoneEl = this.querySelector('.aparte-input-upper');
        } else if (zone === 'footer') {
            zoneEl = this.querySelector('.aparte-input-footer');
        }
        if (!zoneEl) return;
        // For upper: check if direct children exist (chips inject themselves)
        // For footer: check if any footer-slot has children
        let visible: boolean;
        if (zone === 'upper') {
            visible = zoneEl.childElementCount > 0;
        } else {
            visible = Array.from(zoneEl.querySelectorAll('[data-slot]')).some(s => s.childElementCount > 0);
        }
        zoneEl.classList.toggle('has-content', visible);
    }

    private _handleInput(): void {
        this._adjustHeight();
        this._updatePlaceholderVisibility();
        this._updateSendButtonState();
    }

    private _updateSendButtonState(): void {
        if (this._sendButton) {
            // Panel-mode: the panel owns the send button state — bypass isEmpty logic
            if (this._panelActive) {
                this._sendButton.disabled = !this._panelSubmitEnabled;
                return;
            }
            const isEmpty = !this.getValue().trim();
            const isDisabled = this.hasAttribute('disabled');
            if (this._isStreaming) {
                // Show stop icon, always enabled
                this._sendButton.disabled = false;
                this._sendButton.innerHTML = this._getStopIcon();
                this._sendButton.setAttribute('aria-label', 'Stop');
                this._sendButton.setAttribute('title', 'Stop');
                this._sendButton.classList.add('is-streaming');
            } else {
                // Restore send icon
                this._sendButton.disabled = isDisabled || isEmpty;
                this._sendButton.innerHTML = this._getSendIcon();
                const sendLabel = resolveConfig(this).t('sendButton');
                this._sendButton.setAttribute('aria-label', sendLabel);
                this._sendButton.setAttribute('title', sendLabel);
                this._sendButton.classList.remove('is-streaming');
            }
        }
    }

    private _handleKeydown(event: KeyboardEvent): void {
        // During IME composition (CJK), Enter confirms the candidate — never send.
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
            if (event.ctrlKey) {
                // Ctrl+Enter → insert line break
                event.preventDefault();
                document.execCommand('insertLineBreak');
                return;
            }
            if (!event.shiftKey) {
                // Enter (no modifier) → send
                event.preventDefault();
                this._send();
            }
            // Shift+Enter → browser default (newline)
        }
    }

    private _handleFocus(): void {
        // Could add focus-specific behavior here
    }

    private _handleBlur(): void {
        // Could add blur-specific behavior here
    }

    private _handlePaste(event: ClipboardEvent): void {
        // Paste as plain text to avoid formatting issues
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
    }

    private _handleSendClick(): void {
        // Panel-mode: route the click to the panel's submit handler
        if (this._panelActive) {
            this._panelOnSubmit?.();
            return;
        }
        if (this._isStreaming) {
            // Dispatch global abort request
            window.dispatchEvent(new CustomEvent('aparte-abort', { bubbles: false }));
        } else {
            this._send();
        }
    }

    private _handleMessageStart(): void {
        this._isStreaming = true;
        this._updateSendButtonState();
    }

    private _handleMessageDone(): void {
        this._isStreaming = false;
        this._updateSendButtonState();
    }

    private _send(): void {
        const content = this.getValue();
        if (!content) return;

        const detail: AparteSendEventDetail = {
            content,
            timestamp: Date.now(),
            // Allow the host to pass its ID via the `target` attribute so that
            // AparteClient can resolve the target element without DOM traversal.
            targetId: this.getAttribute('target') ?? undefined,
        };

        this.dispatchEvent(new CustomEvent<AparteSendEventDetail>('aparte-send', {
            bubbles: true,
            composed: true,
            detail
        }));

        // Clear after sending
        this.clear();
        this._editor?.focus();
    }

    private _adjustHeight(): void {
        if (!this._editor) return;

        // Reset height to auto to calculate scrollHeight
        this._editor.style.height = 'auto';

        const newHeight = Math.min(
            Math.max(this._editor.scrollHeight, this._minHeight),
            this._maxHeight
        );

        this._editor.style.height = `${newHeight}px`;
    }

    private _updatePlaceholder(): void {
        if (this._editor) {
            this._editor.setAttribute('data-placeholder', this._placeholder);
        }
    }

    private _updatePlaceholderVisibility(): void {
        // CSS :empty handles this for contenteditable, but if we have content that is just whitespace...
        // The :empty selector is very strict. <div contenteditable></div> is empty.
        // But if user types and deletes, there might be <br> left.
        // We might need to manually handle a class if :empty fails.
        // For now, let's rely on :empty logic or simple CSS based on value.
        // Actually aparte.css uses :empty:before.
        // If there's a <br>, it's not empty. We might need to clear <br> on clear().
        if (this._editor && this._editor.innerHTML === '<br>') {
            this._editor.innerHTML = '';
        }
    }

    private _updateDisabledState(disabled: boolean): void {
        if (this._editor) {
            this._editor.contentEditable = (!disabled).toString();
            this._editor.setAttribute('aria-disabled', String(disabled));
        }
        // In panel-mode the send button state is fully managed by _updateSendButtonState;
        // setting disabled directly here would bypass the panel-mode logic.
        if (!this._panelActive) {
            if (this._sendButton) {
                this._sendButton.disabled = disabled;
            }
        }
    }
}

// Register the custom element
if (!customElements.get('aparte-chat-input')) {
    customElements.define('aparte-chat-input', AparteChatInput);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-chat-input': AparteChatInput;
    }
}
