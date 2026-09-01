import { resolveConfig } from '../../config/config-context.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';
import type { AparteIconName } from '../../config/icon-provider.js';

/**
 * AparteIcon
 *
 * The library's icon set, reachable from MARKUP.
 *
 * It existed only in JavaScript. Core ships 25 glyphs and `setIconProvider` is sold as the
 * lever that swaps them, but the only door in was `getIcon(name)` — so a consumer writing
 * plain HTML could not place one, and the icon provider could not reach a single icon that
 * consumer wrote themselves. `<aparte-composer-action>`'s own documentation tells you to
 * put an `<svg>` inside it, which is the same gap stated as an instruction.
 *
 * That gap is why every example on the CSS-classes reference carried 265 characters of
 * path data to demonstrate a 60-character class: there was no shorter way to say "an icon
 * goes here" that actually drew one. `<aparte-icon name="copy">` is that way.
 *
 * It routes through `getIcon`, so it is not a second icon mechanism — it is a markup
 * entrance to the one that exists. Register a provider and every `<aparte-icon>` on the
 * page follows, including the ones in your own templates.
 *
 * ONE CONSEQUENCE, stated because it is the real cost: the 25 glyph NAMES become public
 * API. `expand`, `copy`, `nextBranch` were internal identifiers; renaming one now breaks a
 * consumer's markup.
 *
 * It renders into itself and takes no children — whatever you put inside is replaced. The
 * SVG is `aria-hidden`, because an icon beside a label is decoration; when the icon IS the
 * button's only content, name the BUTTON (`aria-label`), not this.
 *
 * @element aparte-icon
 * @attr {string} name - Which glyph to draw. One of the names `setIconProvider` accepts;
 *   an unknown name draws nothing rather than a broken-image box.
 *
 * @cssprop [--aparte-icon-size=calc(1rem * var(--aparte-font-scale))] - Width and height. `--sm`/`--lg`/`--xl` set it.
 *
 * @example
 * <aparte-icon name="copy"></aparte-icon>
 * <aparte-icon name="check" class="aparte-icon--lg"></aparte-icon>
 * <button class="aparte-btn aparte-btn--icon" aria-label="Copy">
 *   <aparte-icon name="copy"></aparte-icon>
 * </button>
 */
export class AparteIcon extends HTMLElement {
    static get observedAttributes(): string[] { return ['name']; }

    private _unsubscribe: (() => void) | null = null;

    connectedCallback(): void {
        this._render();
        /*
         * A provider registered AFTER this element mounted still reaches it. Without
         * this the icons already on the page kept the built-in glyph while everything
         * rendered later got the consumer's — the same split `<aparte-composer-send>`
         * subscribes to avoid.
         */
        this._unsubscribe = subscribeConfigChange(this, () => this._render());
    }

    disconnectedCallback(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
    }

    attributeChangedCallback(): void {
        if (this.isConnected) this._render();
    }

    private _render(): void {
        const name = this.getAttribute('name');
        /*
         * `getIcon` is typed to the known names and falls back per name, so an unknown
         * one would land on `undefined` and print it. Drawing NOTHING is the honest
         * failure: a misspelled name leaves a gap the author can see, where the string
         * "undefined" in a button would read as a rendering bug in the library.
         */
        const glyph = name ? resolveConfig(this).getIconProvider()[name as AparteIconName]?.() : null;
        this.innerHTML = glyph ?? '';
        // Decoration by default — see the class note above for when to name what instead.
        this.firstElementChild?.setAttribute('aria-hidden', 'true');
    }
}

if (!customElements.get('aparte-icon')) {
    customElements.define('aparte-icon', AparteIcon);
}
