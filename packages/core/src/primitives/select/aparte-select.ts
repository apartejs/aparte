/**
 * AparteSelect
 * 
 * Dropdown select component for AparteCore.
 * Vanilla Web Component with configurable features.
 * 
 * @element aparte-select
 * @attr {string} value - Selected value
 * @attr {string} placeholder - Placeholder text
 * @attr {boolean} disabled - Disabled state
 * @attr {boolean} grouped - Enable optgroup mode
 * @attr {boolean} searchable - Enable search filter
 * @attr {boolean} open - Dropdown open state
 * 
 * @fires aparte-select-change - Fired when selection changes
 * @fires aparte-select-open - Fired when dropdown opens
 * @fires aparte-select-close - Fired when dropdown closes
 */

import './aparte-option.js';
import './aparte-optgroup.js';

export interface AparteSelectChangeDetail {
    value: string;
    label: string;
    previousValue: string;
}

export class AparteSelect extends HTMLElement {
    private static _optIdSeq = 0;

    private _value = '';
    private _isOpen = false;
    private _activeIndex = -1;
    private _trigger: HTMLElement | null = null;
    private _dropdown: HTMLElement | null = null;
    private _searchInput: HTMLInputElement | null = null;
    private _observer: MutationObserver | null = null;

    // Bound handlers for cleanup
    private _boundHandleDocumentClick = this._handleDocumentClick.bind(this);
    private _boundHandleKeydown = this._handleKeydown.bind(this);

    static get observedAttributes(): string[] {
        return ['value', 'placeholder', 'disabled', 'grouped', 'searchable', 'open'];
    }

    connectedCallback(): void {
        this._value = this.getAttribute('value') || '';
        this._isOpen = this.hasAttribute('open');
        this._render();
        this._setupEventListeners();
        this._setupMutationObserver();
    }

    disconnectedCallback(): void {
        document.removeEventListener('click', this._boundHandleDocumentClick);
        document.removeEventListener('keydown', this._boundHandleKeydown);
        this._observer?.disconnect();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
        if (!this.isConnected) return;

        if (name === 'value' && oldValue !== newValue && newValue !== this._value) {
            this._value = newValue || '';
            this._updateTriggerLabel();
        }
        if (name === 'open') {
            this._isOpen = this.hasAttribute('open');
            if (this._isOpen) {
                this._dropdown?.removeAttribute('hidden');
                this._searchInput?.focus();
            } else {
                this._dropdown?.setAttribute('hidden', '');
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    get value(): string {
        return this._value;
    }

    set value(val: string) {
        if (val === this._value) return;
        const previousValue = this._value;
        this._value = val;
        this.setAttribute('value', val);
        this._updateTriggerLabel();
        this._emitChange(previousValue);
    }

    get open(): boolean {
        return this._isOpen;
    }

    set open(val: boolean) {
        if (val) {
            this.setAttribute('open', '');
        } else {
            this.removeAttribute('open');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────────────────────

    private _render(): void {
        const placeholder = this.getAttribute('placeholder') || 'Select...';
        const searchable = this.hasAttribute('searchable');

        // Check if already rendered (has dropdown structure)
        if (this.querySelector('.aparte-select-dropdown')) {
            this._updateTriggerLabel();
            return;
        }

        // First render: capture any slotted children before modifying DOM
        const slottedChildren = Array.from(this.children);

        // Create wrapper structure
        const trigger = document.createElement('div');
        trigger.className = 'aparte-select-trigger';
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        // The label is placeholder text (consumer/attribute-supplied) → textContent,
        // same path as _updateTriggerLabel(), never innerHTML. Only the static SVG
        // chevron uses innerHTML.
        const labelSpan = document.createElement('span');
        labelSpan.className = 'aparte-select-label';
        labelSpan.textContent = placeholder;
        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'aparte-select-chevron';
        chevronSpan.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
        trigger.append(labelSpan, chevronSpan);

        const dropdown = document.createElement('div');
        dropdown.className = 'aparte-select-dropdown';
        dropdown.setAttribute('role', 'listbox');
        dropdown.hidden = !this._isOpen;

        if (searchable) {
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'aparte-select-search';
            searchInput.placeholder = 'Search...';
            dropdown.appendChild(searchInput);
        }

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'aparte-select-options';

        // Move slotted children (aparte-option, aparte-optgroup) into options container
        slottedChildren.forEach(child => {
            if (child.tagName === 'APARTE-OPTION' || child.tagName === 'APARTE-OPTGROUP') {
                optionsContainer.appendChild(child);
            }
        });

        dropdown.appendChild(optionsContainer);

        // Clear and rebuild DOM
        this._observer?.disconnect();
        this.innerHTML = '';
        this.appendChild(trigger);
        this.appendChild(dropdown);

        this._trigger = trigger;
        this._dropdown = dropdown;
        this._searchInput = dropdown.querySelector('.aparte-select-search');

        if (this.isConnected) {
            this._setupMutationObserver();
        }

        // Update label based on current value
        this._updateTriggerLabel();
    }

    private _setupMutationObserver(): void {
        this._observer = new MutationObserver(() => {
            this._updateDropdownContent();
        });

        this._observer.observe(this, { childList: true });
    }

    private _updateDropdownContent(): void {
        // If trigger is gone, the component was likely wiped by innerHTML
        if (!this._trigger || !this.contains(this._trigger)) {
            this._render();
            return;
        }

        const optionsContainer = this.querySelector('.aparte-select-options');
        if (!optionsContainer) {
            // If internal UI is present but container is gone
            this._render();
            return;
        }

        // Collect all potential options from light DOM
        // (those aren't internal UI elements)
        const lightChildren = Array.from(this.children).filter(child =>
            child.className !== 'aparte-select-trigger' &&
            child.className !== 'aparte-select-dropdown'
        );

        if (lightChildren.length === 0) return;

        // Pause observer to prevent self-triggering loop
        this._observer?.disconnect();

        // Clear container (but keep internal stuff if any)
        optionsContainer.innerHTML = '';

        // Move/Append children to container
        lightChildren.forEach(child => {
            optionsContainer.appendChild(child);
        });

        // Resume observer
        if (this.isConnected) {
            this._observer?.observe(this, { childList: true });
        }

        this._updateTriggerLabel();
    }

    private _setupEventListeners(): void {
        // Trigger click
        this._trigger?.addEventListener('click', () => this._toggle());

        // Trigger keyboard
        this._trigger?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                // When open, Enter/Space selects the active option — handled by
                // the document-level nav handler. Only toggle when closed, so we
                // don't close the dropdown on the very keystroke meant to select.
                if (this._isOpen) return;
                e.preventDefault();
                this._toggle();
            }
            if (e.key === 'ArrowDown' && !this._isOpen) {
                e.preventDefault();
                this._openDropdown();
            }
        });

        // Option selection
        this.addEventListener('click', (e) => {
            const option = (e.target as HTMLElement).closest('aparte-option');
            if (option && !option.hasAttribute('disabled')) {
                this._selectOption(option as HTMLElement);
            }
        });

        // Search filter
        this._searchInput?.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            this._filterOptions(query);
        });

        // Close on outside click
        document.addEventListener('click', this._boundHandleDocumentClick);

        // Keyboard navigation
        document.addEventListener('keydown', this._boundHandleKeydown);
    }

    private _handleDocumentClick(e: Event): void {
        if (!this.contains(e.target as Node)) {
            this._closeDropdown();
        }
    }

    private _handleKeydown(e: KeyboardEvent): void {
        if (!this._isOpen) return;

        // Home/End move the caret when typing in the search box; only hijack
        // them for option navigation when focus is not in the search field.
        const inSearch = document.activeElement === this._searchInput;

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this._closeDropdown();
                this._trigger?.focus();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this._moveActive(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._moveActive(-1);
                break;
            case 'Home':
                if (inSearch) break;
                e.preventDefault();
                this._setActive(0);
                break;
            case 'End':
                if (inSearch) break;
                e.preventDefault();
                this._setActive(this._visibleOptions().length - 1);
                break;
            case 'Enter': {
                const active = this._visibleOptions()[this._activeIndex];
                if (active) {
                    e.preventDefault();
                    this._selectOption(active);
                }
                break;
            }
        }
    }

    /** Non-disabled, non-filtered options in DOM order. */
    private _visibleOptions(): HTMLElement[] {
        return Array.from(this.querySelectorAll<HTMLElement>('aparte-option')).filter(
            opt => !opt.hasAttribute('disabled') && opt.style.display !== 'none',
        );
    }

    /** Move the active (keyboard-highlighted) option by `delta`, clamped. */
    private _moveActive(delta: number): void {
        const opts = this._visibleOptions();
        if (opts.length === 0) return;
        const base = this._activeIndex < 0 ? (delta > 0 ? -1 : 0) : this._activeIndex;
        this._setActive(base + delta);
    }

    /** Highlight the option at `index` (clamped) and point aria-activedescendant at it. */
    private _setActive(index: number): void {
        const all = this.querySelectorAll<HTMLElement>('aparte-option');
        all.forEach(o => o.removeAttribute('data-active'));

        const opts = this._visibleOptions();
        if (opts.length === 0) {
            this._activeIndex = -1;
            this._trigger?.removeAttribute('aria-activedescendant');
            return;
        }
        const clamped = Math.max(0, Math.min(index, opts.length - 1));
        this._activeIndex = clamped;

        const active = opts[clamped]!;
        if (!active.id) active.id = `aparte-option-${++AparteSelect._optIdSeq}`;
        active.setAttribute('data-active', '');
        this._trigger?.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView?.({ block: 'nearest' });
    }

    /** Clear the keyboard highlight (on close). */
    private _clearActive(): void {
        this._activeIndex = -1;
        this._trigger?.removeAttribute('aria-activedescendant');
        this.querySelectorAll('aparte-option').forEach(o => o.removeAttribute('data-active'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────────────────

    private _toggle(): void {
        if (this._isOpen) {
            this._closeDropdown();
        } else {
            this._openDropdown();
        }
    }

    private _openDropdown(): void {
        if (this.hasAttribute('disabled')) return;

        this._isOpen = true;
        this._dropdown?.removeAttribute('hidden');
        this._trigger?.setAttribute('aria-expanded', 'true');
        this.setAttribute('open', '');

        // Smart Positioning
        this._updatePosition();

        // Focus search if available
        this._searchInput?.focus();

        // Seed the keyboard highlight on the current selection (or the first
        // option) so ArrowUp/Down have an anchor and screen readers announce it.
        const opts = this._visibleOptions();
        const selectedIdx = opts.findIndex(o => o.getAttribute('value') === this._value);
        this._setActive(selectedIdx >= 0 ? selectedIdx : 0);

        this.dispatchEvent(new CustomEvent('aparte-select-open', { bubbles: true }));
    }

    private _closeDropdown(): void {
        this._isOpen = false;
        this._clearActive();
        this._dropdown?.setAttribute('hidden', '');
        this._trigger?.setAttribute('aria-expanded', 'false');
        this.removeAttribute('open');
        this.removeAttribute('position'); // Reset position attribute

        // Clear position styles set by _updatePosition
        if (this._dropdown) {
            this._dropdown.style.top = '';
            this._dropdown.style.bottom = '';
            this._dropdown.style.left = '';
            this._dropdown.style.width = '';
        }

        // Clear search
        if (this._searchInput) {
            this._searchInput.value = '';
            this._filterOptions('');
        }

        this.dispatchEvent(new CustomEvent('aparte-select-close', { bubbles: true }));
    }

    private _updatePosition(): void {
        if (!this._dropdown || !this._trigger) return;

        const rect = this._trigger.getBoundingClientRect();
        const dropdownHeight = this._dropdown.offsetHeight || 300;
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const GAP = 4; // px gap between trigger and dropdown

        // Always size to trigger width
        this._dropdown.style.left = `${rect.left}px`;
        this._dropdown.style.width = `${rect.width}px`;

        // Decide whether to open upward or downward
        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            // Open upward
            this._dropdown.style.top = '';
            this._dropdown.style.bottom = `${viewportHeight - rect.top + GAP}px`;
            this.setAttribute('position', 'top');
        } else {
            // Open downward
            this._dropdown.style.top = `${rect.bottom + GAP}px`;
            this._dropdown.style.bottom = '';
            this.removeAttribute('position');
        }
    }

    private _selectOption(option: HTMLElement): void {
        const value = option.getAttribute('value') || option.textContent?.trim() || '';
        const previousValue = this._value;

        this._value = value;
        this.setAttribute('value', value);
        this._updateTriggerLabel();
        this._closeDropdown();
        this._emitChange(previousValue);
        this._trigger?.focus();
    }

    private _updateTriggerLabel(): void {
        const labelEl = this._trigger?.querySelector('.aparte-select-label');
        if (labelEl) {
            const selectedLabel = this._getSelectedLabel();
            labelEl.textContent = selectedLabel || this.getAttribute('placeholder') || 'Select...';
        }

        // Update selected state on options
        const options = this.querySelectorAll('aparte-option');
        options.forEach(opt => {
            const isSelected = opt.getAttribute('value') === this._value;
            if (isSelected) {
                opt.setAttribute('selected', '');
            } else {
                opt.removeAttribute('selected');
            }
        });
    }

    private _getSelectedLabel(): string {
        const option = this.querySelector(`aparte-option[value="${this._value}"]`);
        return option?.textContent?.trim() || '';
    }

    private _filterOptions(query: string): void {
        const options = this.querySelectorAll('aparte-option');
        options.forEach(opt => {
            const label = opt.textContent?.toLowerCase() || '';
            const matches = label.includes(query);
            (opt as HTMLElement).style.display = matches ? '' : 'none';
        });
        // Re-anchor the keyboard highlight on the first still-visible option.
        if (this._isOpen) this._setActive(0);
    }

    private _emitChange(previousValue: string): void {
        const detail: AparteSelectChangeDetail = {
            value: this._value,
            label: this._getSelectedLabel(),
            previousValue
        };

        this.dispatchEvent(new CustomEvent<AparteSelectChangeDetail>('aparte-select-change', {
            bubbles: true,
            composed: true,
            detail
        }));
    }
}

// Register
if (!customElements.get('aparte-select')) {
    customElements.define('aparte-select', AparteSelect);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-select': AparteSelect;
    }
}
