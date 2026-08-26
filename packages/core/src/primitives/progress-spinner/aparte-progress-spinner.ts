/**
 * A circular progress spinner, determinate or not.
 *
 * Circular progress spinner web component.
 * - Indeterminate (no `value` attribute): continuous rotation animation
 * - Determinate (`value="0–100"`): fills the arc proportionally
 *
 * The ABSENCE of the attribute is what selects indeterminate, so `value=""` is not
 * "unknown progress" — it parses to 0, i.e. an empty determinate arc. `value` is clamped
 * to 0–100 and anything non-numeric reads as 0; nothing throws.
 *
 * It renders its own SVG into itself on connect and on every `value` change, so it takes
 * no children: whatever you put inside is overwritten. The SVG is `aria-hidden` and the
 * ARIA lives on the host (`role="progressbar"`, `aria-valuemin`/`aria-valuemax`, plus
 * `aria-valuenow` only when determinate) — there is no accessible NAME, so give the
 * element an `aria-label` unless the surrounding text already says what is loading.
 *
 * It draws an arc; it does not manage a loading lifecycle — no delay before appearing, no
 * timeout, no label, no live announcement. Under `prefers-reduced-motion: reduce` the
 * rotation stops (aparte.css scopes that rule to the library's own elements), which is the
 * other reason the indeterminate arc must not be the only signal that work is in flight.
 *
 * @element aparte-progress-spinner
 * @attr {number} value - Progress percentage 0–100 (omit for indeterminate)
 *
 * @cssprop [--aparte-spinner-size=14px] - Width and height of the element; the SVG fills it.
 * @cssprop [--aparte-spinner-stroke=2.5] - Stroke width of both arcs, in the units of the 24×24 viewBox.
 * @cssprop [--aparte-spinner-color=currentColor] - Stroke of the filled (progress) arc.
 * @cssprop [--aparte-spinner-track=color-mix(in srgb, currentColor 15%, transparent)] - Stroke of the track arc behind it.
 *
 * @example
 * <!-- Omit `value` for the indeterminate spin; set it to show real progress. -->
 * <aparte-progress-spinner></aparte-progress-spinner>
 * <aparte-progress-spinner value="62"></aparte-progress-spinner>
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
