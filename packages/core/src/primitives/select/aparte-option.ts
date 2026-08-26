/**
 * AparteOption
 * 
 * Option element for aparte-select dropdown.
 *
 * One selectable row. Only meaningful inside `<aparte-select>` (directly, or nested in an
 * `<aparte-optgroup>`): the parent owns `selected` outright — on its first render, and on
 * every value change after it, it sets that attribute on the option whose `value` matches
 * its own and strips it from all the others. So `selected` written by hand does not
 * survive; set `value` on the select instead. Outside a select nothing selects it: it only
 * styles the row and sets `role="option"` / `aria-selected` from its own attributes.
 *
 * It is not an `<option>`. It carries no form value, `disabled` blocks the click and the
 * keyboard walk but is not a form-disabled state, and when the `value` attribute is
 * absent the trimmed text content is used as the value instead.
 *
 * Keep the label one text node: the `label` property reads only the FIRST text node — that
 * is what keeps the injected status dot out of it — so wrapping the label in an element
 * makes `label` fall back to `value`. The select's own trigger label and its search filter
 * read the full `textContent`, so a wrapped label still displays and still matches.
 *
 * `data-status` is a rendering hook, not state core interprets: any non-empty value
 * appends an `aria-hidden` `.aparte-status-dot` span as the last child, and only
 * `ready`, `cached` and `not-downloaded` have a colour in the stylesheet — anything else
 * renders an uncoloured dot until you style it.
 *
 * @element aparte-option
 * @attr {string} value - Option value
 * @attr {boolean} disabled - Disabled state
 * @attr {boolean} selected - Selected state
 * @attr {string} data-status - Free-form status the host sets; styled, never read by core.
 *
 * @cssprop [--aparte-select-text=var(--aparte-text, #1e293b)] - Option text colour.
 * @cssprop [--aparte-select-option-hover=var(--aparte-surface-2, #f1f5f9)] - Background on hover, and for the keyboard-active row (`[data-active]`), which adds an inset `--aparte-primary` ring on top so the two are distinguishable.
 * @cssprop [--aparte-select-option-selected=color-mix(in srgb, var(--aparte-primary, #3b82f6) 18%, transparent)] - Background of the selected row. A tint by default: a solid accent fill with white text failed WCAG AA in both themes.
 * @cssprop [--aparte-select-option-selected-text=var(--aparte-select-text, var(--aparte-text, #1e293b))] - Text colour of the selected row. Set both this and the background to go back to a solid fill.
 *
 * @example
 * <aparte-select placeholder="Pick a model" value="gpt-4o-mini">
 *   <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
 *   <aparte-option value="o3" disabled>o3 (no access)</aparte-option>
 * </aparte-select>
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
