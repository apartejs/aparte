import { resolveConfig, type AparteIconName } from '../../config/index.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';
import { controlMarkup } from '../../utils/control.js';

/**
 * This element's button. A child already carrying it suppresses core's own render,
 * so the name is a published contract — see `utils/control.ts`.
 */
const BUTTON_CLASS = 'aparte-control';

/**
 * The four axes. **The FIRST entry of each list is the default, and it is the one the base
 * `.aparte-control` rule already draws** — so it emits no modifier, which is what keeps the
 * bare class a complete control.
 *
 * That invariant is load-bearing rather than tidy: `SIZES` was written in visual order
 * (`sm, md, lg`) while the default is `md`, so an unrecognised `size` fell back to the
 * first entry and silently rendered a SMALL button. A test caught it; the fix is to make
 * the rule structural instead of remembering it.
 */
const VARIANTS = ['quiet', 'filled', 'tinted', 'outline'] as const;
const ACCENTS = ['neutral', 'primary', 'success', 'danger', 'warning'] as const;
const SIZES = ['md', 'sm', 'lg'] as const;
const SHAPES = ['default', 'circle', 'pill'] as const;

/** Detail of {@link AparteButton}'s `aparte-button-click`. */
export interface AparteButtonClickEventDetail {
    /** The element's `action-id`, or `''`. Identifies WHICH button fired. */
    actionId: string;
}

/**
 * A button, themed like the rest of aparté.
 *
 * **The class is the primitive; this element is a convenience over it.** Core is light
 * DOM — no shadow root — so `.aparte-control` and its modifiers are reachable from your
 * own stylesheet whether or not you use this tag, and a `<button>` of your own wearing
 * them looks identical. That is the intended path when you already have markup:
 *
 * ```html
 * <button type="button" class="aparte-control aparte-control--filled aparte-control--primary">
 * ```
 *
 * So the element is not here to own the look. It is here for the three things a class
 * cannot do, each of them measured rather than assumed:
 *
 * 1. **Resolve an icon through the configured provider.** `icon="copy"` becomes whatever
 *    `aparteGlobalConfig.getIcon('copy')` returns, and follows a provider swap. A class
 *    has no way to reach the config, so a class-only button ships its own SVG and never
 *    inherits the host's icon set.
 * 2. **Guarantee `type="button"`.** A `<button>` with no type inside a form submits it;
 *    fourteen of core's own controls shipped without one.
 * 3. **Give an icon-only button an accessible name**, from `label`, without the author
 *    having to know that `aria-label` is required here.
 *
 * It emits a bubbling `aparte-button-click`, so the four framework wrappers bind it the
 * way they bind any element event, and nothing has to read a class or a `data-action`
 * string to know a button was pressed.
 *
 * It carries no behaviour of its own: nothing in core listens for its event, so the app
 * is the only thing that can make it do something (ratified decision #8).
 *
 * @element aparte-button
 *
 * @attr {string} variant - `quiet` (default) · `filled` · `tinted` · `outline`.
 * @attr {string} accent - `neutral` (default) · `primary` · `success` · `danger` · `warning`.
 * @attr {string} size - `sm` (28px) · `md` (default, 36px) · `lg` (44px). A coarse pointer
 *   raises any of them to `--aparte-touch-target-size`.
 * @attr {string} shape - `default` (rounded) · `circle` · `pill`.
 * @attr {string} icon - An icon-provider key (`copy`, `check`, …), or raw SVG/HTML when it
 *   starts with `<`. Same contract as `AparteIconProvider`.
 * @attr {string} label - The accessible name, and the visible text unless `icon-only` is
 *   set. Required for an icon-only button; without it a screen reader announces nothing.
 * @attr {boolean} icon-only - Show the icon alone and keep `label` as the accessible name.
 * @attr {boolean} disabled - Disables the inner button.
 * @attr {string} action-id - Carried in the event detail, so one listener can serve
 *   several buttons.
 *
 * @fires {CustomEvent<AparteButtonClickEventDetail>} aparte-button-click - The button was
 *   pressed. Bubbles and composed, carrying `action-id`.
 *
 * @cssprop [--aparte-control-size-sm=28px] - Square size at `size="sm"`.
 * @cssprop [--aparte-input-action-btn-size=36px] - Square size at the default `md`.
 * @cssprop [--aparte-control-size-lg=44px] - Square size at `size="lg"`.
 * @cssprop [--aparte-control-icon-size-sm=15px] - Glyph size at `sm`.
 * @cssprop [--aparte-input-action-btn-icon-size=20px] - Glyph size at `md`.
 * @cssprop [--aparte-control-icon-size-lg=24px] - Glyph size at `lg`.
 * @cssprop [--aparte-radius-action-btn] - Corner radius, unless `shape` overrides it.
 * @cssprop --aparte-primary - The accent at `accent="primary"`.
 * @cssprop --aparte-success - The accent at `accent="success"`.
 * @cssprop --aparte-error - The accent at `accent="danger"`.
 * @cssprop --aparte-warning - The accent at `accent="warning"`.
 * @cssprop --aparte-neutral - The default accent.
 * @cssprop [--aparte-touch-target-size=44px] - Hit-area floor under `(pointer: coarse)`.
 *
 * @example
 * <!-- A filled primary button with a label, and a quiet icon-only one beside it. -->
 * <aparte-button variant="filled" accent="primary" label="Save"></aparte-button>
 * <aparte-button icon="copy" label="Copy" icon-only size="sm"></aparte-button>
 */
export class AparteButton extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _unsubscribes: (() => void)[] = [];
    private _onClick = this._handleClick.bind(this);

    static get observedAttributes(): string[] {
        return ['variant', 'accent', 'size', 'shape', 'icon', 'label', 'icon-only', 'disabled'];
    }

    connectedCallback(): void {
        this._render();
        // An icon-provider or locale swap rewrites the glyph in place rather than
        // rebuilding: a rebuild would drop focus off a button the reader may be on.
        this._unsubscribes.push(subscribeConfigChange(this, () => {
            if (this._button) this._button.innerHTML = this._iconMarkup() + this._labelMarkup();
        }));
    }

    disconnectedCallback(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._unsubscribes.forEach((fn) => fn());
        this._unsubscribes = [];
    }

    attributeChangedCallback(): void {
        // Every attribute here changes a class or the contents, and none of them owns
        // state the way a composer control does — so a full re-render is correct, and
        // avoids a per-attribute branch that would drift from the list above.
        if (this._button) this._rerender();
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /** One of `allowed`, or the first entry when the attribute is absent or unknown. */
    private _pick<T extends readonly string[]>(attr: string, allowed: T): T[number] {
        const value = this.getAttribute(attr);
        return (allowed as readonly string[]).includes(value ?? '') ? (value as T[number]) : allowed[0]!;
    }

    private _modifiers(): string[] {
        // One rule, applied four times: take the value, and emit a modifier unless it is
        // the default. Comparing against `allowed[0]` rather than a written-out literal is
        // what stops the two from drifting apart.
        const out = [
            this._modifier('variant', VARIANTS),
            this._modifier('accent', ACCENTS),
            this._modifier('size', SIZES),
            this._modifier('shape', SHAPES),
        ].filter(Boolean) as string[];
        if (this._hasLabelText()) out.push(`${BUTTON_CLASS}--label`);
        return out;
    }

    /** The modifier for one axis, or `null` when the value is that axis's default. */
    private _modifier<T extends readonly string[]>(attr: string, allowed: T): string | null {
        const value = this._pick(attr, allowed);
        return value === allowed[0] ? null : `${BUTTON_CLASS}--${value}`;
    }

    private _hasLabelText(): boolean {
        return !this.hasAttribute('icon-only') && (this.getAttribute('label') ?? '') !== '';
    }

    /**
     * Provider key, or raw markup when it opens with `<` — the AparteIconProvider contract.
     *
     * The cast is the same one `<aparte-composer-action>` makes and for the same reason: the
     * key arrives as an HTML attribute, so it is a `string` at the boundary whatever the
     * provider's key union says. An unknown key falls back to the raw text rather than
     * throwing, which is what makes a custom icon set additive.
     */
    private _iconMarkup(): string {
        const icon = this.getAttribute('icon') ?? '';
        if (!icon) return '';
        if (icon.trimStart().startsWith('<')) return icon;
        return resolveConfig(this).getIcon(icon as AparteIconName) ?? '';
    }

    private _labelMarkup(): string {
        if (!this._hasLabelText()) return '';
        const span = document.createElement('span');
        span.className = `${BUTTON_CLASS}__label`;
        span.textContent = this.getAttribute('label') ?? '';
        return span.outerHTML;
    }

    private _rerender(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._button = null;
        this.innerHTML = '';
        this._render();
    }

    private _render(): void {
        if (this.querySelector(`.${BUTTON_CLASS}`)) return;

        const label = this.getAttribute('label') ?? '';
        // safe-text: the icon is provider output, or markup the consumer declared trusted
        // by starting it with `<` — the same contract AparteIconProvider carries. The
        // label goes through `controlMarkup`, which escapes it.
        const icon = this._iconMarkup() + this._labelMarkup();

        this.innerHTML = controlMarkup({
            part: BUTTON_CLASS,
            modifiers: this._modifiers(),
            label,
            icon,
            disabled: this.hasAttribute('disabled'),
        });

        this._button = this.querySelector(`[data-aparte-control="${BUTTON_CLASS}"]`);
        this._button?.addEventListener('click', this._onClick);
    }

    private _handleClick(): void {
        this.dispatchEvent(new CustomEvent<AparteButtonClickEventDetail>('aparte-button-click', {
            bubbles: true,
            composed: true,
            detail: { actionId: this.getAttribute('action-id') ?? '' },
        }));
    }
}

if (!customElements.get('aparte-button')) {
    customElements.define('aparte-button', AparteButton);
}
