/**
 * AparteOptgroup
 * 
 * Option group element for aparte-select dropdown.
 * 
 * @element aparte-optgroup
 * @attr {string} label - Group label
 * @attr {boolean} collapsible - Allow collapse/expand
 * @attr {boolean} collapsed - Collapsed state
 */

export class AparteOptgroup extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['label', 'collapsible', 'collapsed', 'loading'];
    }

    connectedCallback(): void {
        this.setAttribute('role', 'group');
        this._render();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;

        if (name === 'collapsed') {
            this._updateCollapsedState();
        }

        if (this.isConnected) {
            this._render();
        }
    }

    get label(): string {
        return this.getAttribute('label') || '';
    }

    set label(val: string) {
        this.setAttribute('label', val);
    }

    get collapsible(): boolean {
        return this.hasAttribute('collapsible');
    }

    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(val: boolean) {
        if (val) {
            this.setAttribute('collapsed', '');
        } else {
            this.removeAttribute('collapsed');
        }
    }

    get loading(): boolean {
        return this.hasAttribute('loading');
    }

    set loading(val: boolean) {
        if (val) this.setAttribute('loading', '');
        else this.removeAttribute('loading');
    }

    private _render(): void {
        // Only render header if we have a label
        if (this.label) {
            const existingHeader = this.querySelector('.aparte-optgroup-header');
            if (!existingHeader) {
                const header = document.createElement('div');
                header.className = 'aparte-optgroup-header';
                header.setAttribute('aria-label', this.label);
                // `label` is an attribute value — with the model-selector it carries a
                // provider-supplied name — so it goes through textContent, never
                // innerHTML (a hostile name would otherwise inject here).
                const labelSpan = document.createElement('span');
                labelSpan.className = 'aparte-optgroup-label';
                labelSpan.textContent = this.label;
                header.appendChild(labelSpan);

                if (this.collapsible) {
                    const chevron = document.createElement('span');
                    chevron.className = 'aparte-optgroup-chevron';
                    header.appendChild(chevron);
                    header.style.cursor = 'pointer';
                    header.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._toggleCollapse();
                    });
                }

                this.insertBefore(header, this.firstChild);
            }
        }

        // Update loading state
        this._updateLoadingState();

        // Update collapsed state
        this._updateCollapsedState();
    }

    private _updateLoadingState(): void {
        let loader = this.querySelector('.aparte-optgroup-loader');
        if (this.loading) {
            if (!loader) {
                loader = document.createElement('div');
                loader.className = 'aparte-optgroup-loader';
                loader.innerHTML = '<span class="aparte-spinner-small"></span> Fetching models...';
                this.appendChild(loader);
            }
        } else if (loader) {
            loader.remove();
        }
    }

    private _toggleCollapse(): void {
        this.collapsed = !this.collapsed;

        // Dispatch event before updating UI to allow parent to react (e.g. fetch data)
        this.dispatchEvent(new CustomEvent('aparte-optgroup-toggle', {
            bubbles: true,
            composed: true,
            detail: {
                label: this.label,
                collapsed: this.collapsed
            }
        }));

        this._updateCollapsedState();
    }

    private _updateCollapsedState(): void {
        const options = this.querySelectorAll('aparte-option');
        options.forEach(opt => {
            (opt as HTMLElement).style.display = this.collapsed ? 'none' : '';
        });
    }
}

// Register
if (!customElements.get('aparte-optgroup')) {
    customElements.define('aparte-optgroup', AparteOptgroup);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-optgroup': AparteOptgroup;
    }
}
