/**
 * The composer's bottom row — the strip a mode picker, a model selector or a token
 * counter belongs in, rather than a bar of your own floating below the chat. Purely
 * structural: it lays its children out in a row and gets out of the way.
 *
 * @element aparte-composer-toolbar
 *
 * **Position is the DOM order.** `margin-inline-start: auto` on a child pushes it (and
 * everything after it) to the end of the row. That is the whole placement API on
 * purpose: there is no `left`/`right` to be wrong about, so the row reads correctly in a
 * right-to-left locale without the author thinking about it.
 *
 * The row is not part of the default `<aparte-chat>` shell — nothing is drawn until you
 * put something in it.
 *
 * @attr data-empty - Reflected BY the element while it holds no element child; the
 *                    stylesheet hides it then. Read-only, do not set it yourself.
 *
 * @example
 * <aparte-composer>
 *   <div class="aparte-composer-shell">
 *     <div class="aparte-composer-row">
 *       <aparte-composer-input></aparte-composer-input>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *
 *     <!-- `aparte-model-selector` is NOT part of core: importing
 *          `@aparte/plugin-model-selector` is what defines it. Until then the tag
 *          renders empty and inert with no error, and upgrades by itself when the
 *          definition arrives. Any element of your own works here too. -->
 *     <aparte-composer-toolbar>
 *       <my-mode-picker></my-mode-picker>
 *       <aparte-model-selector style="margin-inline-start:auto"></aparte-model-selector>
 *     </aparte-composer-toolbar>
 *   </div>
 * </aparte-composer>
 */
export class AparteComposerToolbar extends HTMLElement {
    private _observer: MutationObserver | null = null;

    connectedCallback(): void {
        this._syncEmpty();
        // Children can arrive after connection — a framework commits the element and its
        // children in whichever order suits it, and a consumer may add a control later.
        this._observer ??= new MutationObserver(() => this._syncEmpty());
        this._observer.observe(this, { childList: true });
    }

    disconnectedCallback(): void {
        this._observer?.disconnect();
        this._observer = null;
    }

    /**
     * Reflect `data-empty` from the presence of an ELEMENT child.
     *
     * Not `:empty` in CSS: that selector does not match an element holding a whitespace
     * text node, so a template that indents its content keeps the row — separator,
     * padding and all — while it looks empty to the user. Every framework template
     * indents. An empty row must not draw its own separator (the same rule as an empty
     * bubble action bar).
     *
     * Non-whitespace TEXT counts as content, not just an element child: a hand-written
     * row holding a bare token count (`<aparte-composer-toolbar>1 240 tokens</…>`) is
     * not empty, and hiding it would be a twenty-minute mystery for whoever wrote it.
     */
    private _syncEmpty(): void {
        const hasContent = Boolean(this.firstElementChild) || this.textContent?.trim() !== '';
        if (hasContent) this.removeAttribute('data-empty');
        else this.setAttribute('data-empty', '');
    }
}

if (!customElements.get('aparte-composer-toolbar')) {
    customElements.define('aparte-composer-toolbar', AparteComposerToolbar);
}
