import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';

/**
 * @element aparte-composer-input
 *
 * Contenteditable text input primitive.
 * Must be a descendant of <aparte-composer>.
 *
 * Behaviour: Enter submits (calls root.submit()), Shift+Enter inserts newline.
 * Auto-expands up to max-height. Paste strips HTML, handles image paste.
 *
 * @attr placeholder  - Placeholder text (fallback: reads from aparte-composer)
 * @attr max-height   - Max height in px before scroll (default: 200)
 * @attr min-height   - Min height in px. When omitted, the stylesheet's
 *                      min-height governs (44px in aparte.css) — so themes can
 *                      resize the editor in pure CSS without being fought by
 *                      an inline height.
 */
export class AparteComposerInput extends HTMLElement {
    private _editor: HTMLDivElement | null = null;
    private _maxHeight = 200;
    private _minHeight = 44;
    private _unsubscribes: (() => void)[] = [];

    // Bound handlers
    private _onInput = this._handleInput.bind(this);
    private _onKeydown = this._handleKeydown.bind(this);
    private _onFocus = this._handleFocus.bind(this);
    private _onBlur = this._handleBlur.bind(this);
    private _onPaste = this._handlePaste.bind(this);

    static get observedAttributes(): string[] {
        return ['placeholder', 'max-height', 'min-height', 'disabled'];
    }

    connectedCallback(): void {
        this._render();
        this._connectToRoot();
        this._scheduleInitialReflow();
    }

    disconnectedCallback(): void {
        this._editor?.removeEventListener('input', this._onInput);
        this._editor?.removeEventListener('keydown', this._onKeydown);
        this._editor?.removeEventListener('focus', this._onFocus);
        this._editor?.removeEventListener('blur', this._onBlur);
        this._editor?.removeEventListener('paste', this._onPaste);
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (name === 'placeholder') this._updatePlaceholder();
        if (name === 'max-height') this._maxHeight = parseInt(value || '200', 10);
        if (name === 'min-height') this._minHeight = parseInt(value || '44', 10);
        if (name === 'disabled') this._updateDisabled(value !== null);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    getValue(): string {
        // `textContent` drops `<br>`, so multi-line content would collapse onto one
        // line. Serialize the editor ourselves: text nodes as-is, `<br>` → newline.
        // We keep the editor flat (text + <br>, see _handleKeydown), but descend into
        // any stray wrapper for safety.
        if (!this._editor) return '';
        let out = '';
        const walk = (node: Node): void => {
            node.childNodes.forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
                else if (child.nodeName === 'BR') out += '\n';
                else walk(child);
            });
        };
        walk(this._editor);
        return out.trim();
    }

    setValue(value: string): void {
        if (!this._editor) return;
        this._editor.textContent = value;
        this._updatePlaceholderVisibility();
        this._adjustHeight();
        this._getRoot()?.setValue(value);
    }

    clear(): void {
        if (!this._editor) return;
        this._editor.innerHTML = '';
        this._updatePlaceholderVisibility();
        this._adjustHeight();
        this._getRoot()?.setValue('');
    }

    override focus(): void { this._editor?.focus(); }
    override blur(): void { this._editor?.blur(); }

    /** Focus the editor and place the caret at the very end of its content. */
    focusEnd(): void {
        if (!this._editor) return;
        this._editor.focus();
        const sel = this.ownerDocument?.getSelection();
        if (!sel) return;
        const range = this.ownerDocument.createRange();
        range.selectNodeContents(this._editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _getPlaceholder(): string {
        return this.getAttribute('placeholder')
            || this._getRoot()?.placeholder
            || resolveConfig(this).t('inputPlaceholder')
            || 'Type a message...';
    }

    private _render(): void {
        if (this.querySelector('.aparte-ci-editor')) return;

        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;
        const placeholder = this._getPlaceholder();

        this.innerHTML = `<div
            class="aparte-ci-editor"
            contenteditable="${!disabled}"
            role="textbox"
            aria-multiline="true"
            aria-label="${placeholder}"
            tabindex="0"
            aria-disabled="${disabled}"
            data-placeholder="${placeholder}"
        ></div>`;

        this._editor = this.querySelector('.aparte-ci-editor');
        this._editor?.addEventListener('input', this._onInput);
        this._editor?.addEventListener('keydown', this._onKeydown);
        this._editor?.addEventListener('focus', this._onFocus);
        this._editor?.addEventListener('blur', this._onBlur);
        this._editor?.addEventListener('paste', this._onPaste);

        this._adjustHeight();
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        // Sync disabled state from root
        this._unsubscribes.push(
            root._on('disabled-change', ({ disabled }) => this._updateDisabled(disabled))
        );

        // When root clears value (after submit), clear our editor
        this._unsubscribes.push(
            root._on('value-change', ({ value }) => {
                if (value === '' && this.getValue() !== '') this.clear();
            })
        );

        // Sync streaming state — disable input while streaming
        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                this._updateDisabled(streaming || root.disabled);
            })
        );
    }

    private _handleInput(): void {
        this._adjustHeight();
        // After a delete-all, contenteditable leaves residual `<br>` tags
        // (Chromium especially) so the `:empty` CSS pseudo-class no longer
        // matches and the placeholder stays hidden. Force-clear when text
        // content reduces to whitespace so the placeholder reappears.
        if (this._editor && !this._editor.textContent?.trim() && this._editor.innerHTML !== '') {
            this._editor.innerHTML = '';
        }
        this._updatePlaceholderVisibility();
        const value = this.getValue();
        this._getRoot()?.setValue(value);
    }

    private _handleKeydown(e: KeyboardEvent): void {
        // During IME composition (CJK/Japanese/Korean), Enter confirms the
        // candidate — it must never submit. `keyCode === 229` is the legacy
        // signal for engines that don't set `isComposing`.
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key !== 'Enter') return;
        // `submit-on-enter` (default true): Enter submits, Shift+Enter inserts
        // a newline. When false the mapping inverts — Shift+Enter submits and
        // a bare Enter inserts a newline (lets the user author multi-line).
        const submitOnEnter = this._getRoot()?.submitOnEnter ?? true;
        const submits = submitOnEnter ? !e.shiftKey : e.shiftKey;
        if (submits) {
            e.preventDefault();
            const root = this._getRoot();
            if (root) {
                root.submit();
            } else {
                // Standalone (no <aparte-composer> parent, e.g. the bubble's inline
                // editor): there is no root to submit to, so surface the intent as a
                // DOM event the host can act on. Keeps this primitive reusable on its
                // own — the IME guard + submitOnEnter mapping above stay the single
                // source of truth for "when to submit".
                this.dispatchEvent(new CustomEvent('aparte-composer-submit', { bubbles: true }));
            }
        } else {
            // Newline branch. Take control instead of the browser's contenteditable
            // default, which inserts <div>/<br> wrappers that resist deletion.
            // `insertLineBreak` inserts a single <br> and manages the trailing bogus
            // <br> so backspace removes it cleanly (the "can't delete the newline" bug).
            e.preventDefault();
            // Nothing to break on an empty field — don't seed a leading blank line.
            if (!this._editor?.textContent) return;
            this.ownerDocument?.execCommand('insertLineBreak');
        }
    }

    private _handleFocus(): void {
        this.classList.add('is-focused');
    }

    private _handleBlur(): void {
        this.classList.remove('is-focused');
    }

    private _handlePaste(e: ClipboardEvent): void {
        e.preventDefault();
        const cd = e.clipboardData;
        if (!cd) return;

        // Image paste → push to root attachments
        const imageFile = Array.from(cd.items).find(i => i.type.startsWith('image/'))?.getAsFile();
        if (imageFile) {
            this._getRoot()?.addAttachments([imageFile]);
            return;
        }

        // Plain text paste
        const text = cd.getData('text/plain');
        if (text) {
            document.execCommand('insertText', false, text);
        }
    }

    private _adjustHeight(): void {
        if (!this._editor) return;
        // Measure with height:0 (not auto): an explicit height opts the editor
        // OUT of any parent flex `align-items: stretch`, so scrollHeight reflects
        // the real content — not the (taller) row it may be stretched into. With
        // `auto`, a stretching parent inflates scrollHeight and the editor gets
        // stuck tall until the next reflow.
        this._editor.style.height = '0px';
        // Floor: the `min-height` ATTRIBUTE when explicitly set; otherwise defer
        // to the stylesheet (CSS min-height caps an inline height anyway). A
        // hardcoded JS floor would override theme CSS with an inline style and
        // break editor/controls alignment in restyled composers.
        const floor = this.hasAttribute('min-height') ? this._minHeight : 0;
        const contentHeight = this._editor.scrollHeight;
        const h = Math.min(Math.max(contentHeight, floor), this._maxHeight);
        this._editor.style.height = `${h}px`;
        this._editor.style.overflowY = contentHeight > this._maxHeight ? 'auto' : 'hidden';
    }

    /**
     * The first `_adjustHeight()` runs synchronously in `_render()` on connect —
     * before the stylesheet, flex layout and web fonts have necessarily settled.
     * On an unstabilized layout `scrollHeight` can read inflated, leaving the
     * editor stuck tall (misaligned with the composer controls) until the first
     * keystroke re-measures it. Re-measure once the layout is ready so it's
     * correct from the first paint.
     */
    private _scheduleInitialReflow(): void {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => this._adjustHeight());
        }
        const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
        fonts?.ready?.then(() => this._adjustHeight()).catch(() => { /* fonts unavailable — rAF path covers it */ });
    }

    private _updatePlaceholder(): void {
        if (this._editor) {
            const p = this._getPlaceholder();
            this._editor.setAttribute('data-placeholder', p);
            this._editor.setAttribute('aria-label', p);
        }
    }

    private _updatePlaceholderVisibility(): void {
        // Handled by CSS :empty — nothing to do
    }

    private _updateDisabled(disabled: boolean): void {
        if (!this._editor) return;
        this._editor.setAttribute('contenteditable', String(!disabled));
        this._editor.setAttribute('aria-disabled', String(disabled));
    }
}

if (!customElements.get('aparte-composer-input')) {
    customElements.define('aparte-composer-input', AparteComposerInput);
}
