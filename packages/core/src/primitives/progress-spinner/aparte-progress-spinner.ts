/**
 * AparteProgressSpinner
 *
 * Circular progress spinner web component.
 * - Indeterminate (no `value` attribute): continuous rotation animation
 * - Determinate (`value="0–100"`): fills the arc proportionally
 *
 * @element aparte-progress-spinner
 * @attr {number} value - Progress percentage 0–100 (omit for indeterminate)
 *
 * @cssvar --aparte-spinner-size    Size of the spinner. Default: 14px
 * @cssvar --aparte-spinner-stroke  Stroke width in SVG units. Default: 2.5
 * @cssvar --aparte-spinner-color   Fill arc stroke color. Default: currentColor
 * @cssvar --aparte-spinner-track   Track arc stroke color. Default: 15% currentColor
 */
export class AparteProgressSpinner extends HTMLElement {
    static get observedAttributes(): string[] { return ['value']; }

    /** Radius of the SVG circle (viewBox is 0 0 24 24, center at 12,12) */
    private readonly _r = 9;
    private get _circ(): number { return 2 * Math.PI * this._r; }

    connectedCallback(): void { this._render(); }
    attributeChangedCallback(): void { this._render(); }

    private _render(): void {
        const raw = this.getAttribute('value');
        const value = raw !== null
            ? Math.min(100, Math.max(0, parseFloat(raw) || 0))
            : null;

        this.setAttribute('role', 'progressbar');
        this.setAttribute('aria-valuemin', '0');
        this.setAttribute('aria-valuemax', '100');
        if (value !== null) {
            this.setAttribute('aria-valuenow', String(value));
        } else {
            this.removeAttribute('aria-valuenow');
        }

        // Determinate: dashoffset shrinks from circ→0 as value goes 0→100
        const dashoffset = value !== null ? this._circ * (1 - value / 100) : 0;
        // Indeterminate: fixed partial arc (~72% of circumference)
        const dasharray = value !== null
            ? `${this._circ.toFixed(2)}`
            : `${(this._circ * 0.72).toFixed(2)} ${(this._circ * 0.28).toFixed(2)}`;

        this.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle class="aparte-spinner-track" cx="12" cy="12" r="${this._r}"/><circle class="aparte-spinner-fill" cx="12" cy="12" r="${this._r}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset.toFixed(2)}"/></svg>`;
    }
}

if (!customElements.get('aparte-progress-spinner')) {
    customElements.define('aparte-progress-spinner', AparteProgressSpinner);
}
