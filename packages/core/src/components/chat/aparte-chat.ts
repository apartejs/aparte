import type { AparteChatViewport } from '../viewport/aparte-chat-viewport.js';
import type { AparteComposer } from '../composer/aparte-composer.js';
// Defines <aparte-elicitation>, which the default composition below writes. A tag
// nothing has defined is an inert unknown element, so the import is the difference
// between a presenter and a placeholder.
import '../elicitation/aparte-elicitation.js';
import { escapeAttr } from '../../utils/escape.js';

/**
 * AparteChat - The Shell
 *
 * The container element for a chat. Wrap a `<aparte-chat-viewport>` and a
 * `<aparte-composer>` in it and it lays them out as a flex column — the viewport
 * grows and scrolls, the composer sits below. Provide your own children for full
 * control (custom composer, extra buttons), or leave it empty and it fills in a
 * sensible default composition. Uses Light DOM for global CSS styling.
 *
 * Being a component (not a bare `<div>`), it also owns behaviour a wrapper div
 * can't: with `center-empty`, it watches its own viewport and keeps the composer
 * centered as a welcome state until the first message, then slides to the normal
 * layout — no external JavaScript.
 *
 * Presentational only: it does NOT wire a transport/client. Attach an
 * `AparteClient`, or handle `aparte-send` yourself, as with the primitives.
 * Size the element via CSS (a height, or let it fill a sized parent).
 *
 * @element aparte-chat
 * @attr placeholder  - Placeholder for the composer input (default composition)
 * @attr disabled     - Disables the composer
 * @attr center-empty - Center the composer as a welcome state until the first message, then slide to the normal layout
 * @attr attachments  - Add the file picker + chips strip to the default composition (opt-in: the host must consume the files — an `AparteClient` does, a hand-rolled loop must read `event.detail.files`)
  *
 * @example
 * <!-- Left empty it fills in a viewport, an input and a send button. -->
 * <aparte-chat center-empty placeholder="Say something…" style="height: 600px"></aparte-chat>
 *
 * <!-- Or compose it yourself; the container still lays it out and runs center-empty. -->
 * <aparte-chat center-empty attachments style="height: 600px">
 *   <aparte-chat-viewport></aparte-chat-viewport>
 *   <aparte-composer>
 *     <div class="aparte-composer-shell">
 *       <div class="aparte-composer-row">
 *         <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *         <aparte-composer-send></aparte-composer-send>
 *       </div>
 *     </div>
 *   </aparte-composer>
 * </aparte-chat>
 */
export class AparteChat extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['placeholder', 'disabled', 'center-empty', 'attachments'];
  }

  private _observer: MutationObserver | null = null;

  /**
   * True only for the composition THIS element injected. An author-provided
   * composer (or a `framework-managed` host) is never edited by the attachments
   * toggle below — those own their own markup.
   */
  private _ownsShell = false;

  connectedCallback(): void {
    this._render();
    this._forwardAttr('placeholder');
    this._forwardAttr('disabled');
    this._syncEmptyWatch();
  }

  disconnectedCallback(): void {
    this._observer?.disconnect();
    this._observer = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'center-empty') {
      this._syncEmptyWatch();
      return;
    }
    if (name === 'attachments') {
      this._syncAttachments();
      return;
    }
    // placeholder / disabled forward to the inner composer. An explicit removal
    // mirrors through; a never-set attribute is left alone (so a caller-provided
    // composer keeps its own).
    const composer = this.querySelector('aparte-composer');
    if (!composer) return;
    if (newValue !== null) composer.setAttribute(name, newValue);
    else composer.removeAttribute(name);
  }

  /** The message viewport (yours or the default), or `null` before connect. */
  get viewport(): AparteChatViewport | null {
    return this.querySelector('aparte-chat-viewport');
  }

  /** The composer (yours or the default), or `null` before connect. */
  get composer(): AparteComposer | null {
    return this.querySelector('aparte-composer');
  }

  private _render(): void {
    // A framework wrapper renders the composition itself — and its children do not
    // exist yet when this runs (the element is upgraded on insert, before the
    // framework's template renders), so the viewport check below can't see them.
    // `framework-managed` is the wrapper's explicit "hands off" signal: without it
    // the default composition below would be injected UNDER the framework's own.
    if (this.hasAttribute('framework-managed')) return;

    // Author-provided composition wins — if a viewport is already inside, use the
    // children as given and only lay them out (via CSS). Otherwise fill in a
    // default viewport + composer so the empty tag "just works".
    if (this.querySelector('aparte-chat-viewport')) return;

    // The composer's `placeholder` is read by its input via `closest()` at upgrade
    // time (no event), so it must be on the element in the initial markup.
    const placeholder = this.getAttribute('placeholder');
    const composerAttrs =
      (placeholder !== null ? ` placeholder="${escapeAttr(placeholder)}"` : '') +
      (this.hasAttribute('disabled') ? ' disabled' : '');

    // Attachments are opt-in: the picker only makes sense when the host consumes
    // the files (an `AparteClient` inlines them per `rawFileInject`; a hand-rolled
    // loop must read `event.detail.files`). Offering it unconditionally would show
    // a button that silently drops what the user attached.
    const attachments = this.hasAttribute('attachments');

    /*
     * The presenter ships in the default composition, and that is a change of tier.
     *
     * It renders nothing by itself — it registers as the presenter for this subtree and
     * mounts a panel in the composer when something asks. It used to be opt-in, which
     * was right while asking the user was a plugin's business. It is not any more: the
     * BUILT-IN approval gate asks through it, so a chat without one cannot honour
     * `needsApproval` at all. An affordance core can honour end to end is on by default
     * (ratified decision #8, tier a); leaving this out would have made the gate depend
     * on a tag nobody was told to write.
     */
    this.innerHTML = `
      <aparte-chat-viewport></aparte-chat-viewport>
      <aparte-elicitation></aparte-elicitation>
      <aparte-composer${composerAttrs}>
        <div class="aparte-composer-shell">
          ${attachments ? '<aparte-composer-attachments></aparte-composer-attachments>' : ''}
          <div class="aparte-composer-row">
            ${attachments ? '<aparte-composer-add-attachment></aparte-composer-add-attachment>' : ''}
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>
    `;
    this._ownsShell = true;
  }

  /**
   * Add/remove the two attachment primitives on the composition we injected, so
   * toggling the attribute after mount works like the wrappers' reactive prop
   * (there, a re-render does it). Author-provided markup is left alone.
   */
  private _syncAttachments(): void {
    if (!this._ownsShell) return;
    const composer = this.composer;
    const shell = composer?.querySelector('.aparte-composer-shell');
    const row = shell?.querySelector('.aparte-composer-row');
    if (!composer || !shell || !row) return;

    const strip = shell.querySelector('aparte-composer-attachments');
    const picker = row.querySelector('aparte-composer-add-attachment');

    if (this.hasAttribute('attachments')) {
      if (!strip) shell.insertBefore(document.createElement('aparte-composer-attachments'), row);
      if (!picker) row.insertBefore(document.createElement('aparte-composer-add-attachment'), row.firstChild);
      return;
    }

    strip?.remove();
    picker?.remove();
    // Files picked before the capability was withdrawn would otherwise ride on
    // the next send with nothing in the UI showing them.
    composer.clearAttachments();
  }

  /** Set an attribute on the inner composer only when the shell carries it. */
  private _forwardAttr(name: string): void {
    if (!this.hasAttribute(name)) return;
    this.querySelector('aparte-composer')?.setAttribute(name, this.getAttribute(name) ?? '');
  }

  /** Start/stop watching the viewport so `center-empty` toggles itself. */
  private _syncEmptyWatch(): void {
    this._observer?.disconnect();
    this._observer = null;

    if (!this.hasAttribute('center-empty')) {
      this.removeAttribute('data-empty');
      return;
    }

    const viewport = this.querySelector('aparte-chat-viewport');
    if (!viewport) return;

    this._updateEmpty();
    // A message is an <aparte-chat-bubble>; watch the viewport for the first one.
    this._observer = new MutationObserver(() => this._updateEmpty());
    this._observer.observe(viewport, { childList: true, subtree: true });
  }

  private _updateEmpty(): void {
    const viewport = this.querySelector('aparte-chat-viewport');
    const empty = !viewport || !viewport.querySelector('aparte-chat-bubble');
    this.toggleAttribute('data-empty', empty);
  }

}

// Register the custom element
if (!customElements.get('aparte-chat')) {
  customElements.define('aparte-chat', AparteChat);
}
