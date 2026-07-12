/**
 * AparteOption
 * 
 * Option element for aparte-select dropdown.
 * 
 * @element aparte-option
 * @attr {string} value - Option value
 * @attr {boolean} disabled - Disabled state
 * @attr {boolean} selected - Selected state
 */

export class AparteOption extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['value', 'disabled', 'selected', 'data-status'];
    }

    connectedCallback(): void {
        this.setAttribute('role', 'option');
        this._updateAriaSelected();
        this._updateStatusDot();
    }

    attributeChangedCallback(name: string): void {
        if (name === 'selected') {
            this._updateAriaSelected();
        }
        if (name === 'disabled') {
            this.setAttribute('aria-disabled', this.hasAttribute('disabled') ? 'true' : 'false');
        }
        if (name === 'data-status') {
            this._updateStatusDot();
        }
    }

    get value(): string {
        return this.getAttribute('value') || this.textContent?.trim() || '';
    }

    set value(val: string) {
        this.setAttribute('value', val);
    }

    get label(): string {
        // Use only the first text node, ignoring injected spans (e.g. status dot)
        const textNode = Array.from(this.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        return textNode?.textContent?.trim() || this.value;
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled');
    }

    set disabled(val: boolean) {
        if (val) {
            this.setAttribute('disabled', '');
        } else {
            this.removeAttribute('disabled');
        }
    }

    get selected(): boolean {
        return this.hasAttribute('selected');
    }

    set selected(val: boolean) {
        if (val) {
            this.setAttribute('selected', '');
        } else {
            this.removeAttribute('selected');
        }
    }

    private _updateAriaSelected(): void {
        this.setAttribute('aria-selected', this.selected ? 'true' : 'false');
    }

    private _updateStatusDot(): void {
        const status = this.getAttribute('data-status');
        let dot = this.querySelector<HTMLSpanElement>('.aparte-status-dot');

        if (!status) {
            dot?.remove();
            return;
        }

        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'aparte-status-dot';
            dot.setAttribute('aria-hidden', 'true');
            this.appendChild(dot);
        }

        dot.setAttribute('data-status', status);
    }
}

// Register
if (!customElements.get('aparte-option')) {
    customElements.define('aparte-option', AparteOption);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-option': AparteOption;
    }
}
