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
 * @attr {string} placeholder   - Placeholder for the composer input (default composition)
 * @attr {boolean} disabled     - Disables the composer
 * @attr {boolean} center-empty - Center the composer as a welcome state until the first message
 */
import type { AparteChatViewport } from '../viewport/aparte-chat-viewport.js';
import type { AparteComposer } from '../composer/aparte-composer.js';

export class AparteChat extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['placeholder', 'disabled', 'center-empty'];
  }

  private _observer: MutationObserver | null = null;

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
    // Author-provided composition wins — if a viewport is already inside, use the
    // children as given and only lay them out (via CSS). Otherwise fill in a
    // default viewport + composer so the empty tag "just works".
    if (this.querySelector('aparte-chat-viewport')) return;

    // The composer's `placeholder` is read by its input via `closest()` at upgrade
    // time (no event), so it must be on the element in the initial markup.
    const placeholder = this.getAttribute('placeholder');
    const composerAttrs =
      (placeholder !== null ? ` placeholder="${this._escapeAttr(placeholder)}"` : '') +
      (this.hasAttribute('disabled') ? ' disabled' : '');

    this.innerHTML = `
      <aparte-chat-viewport></aparte-chat-viewport>
      <aparte-composer${composerAttrs}>
        <div class="aparte-composer-shell">
          <div class="aparte-composer-row">
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>
    `;
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

  private _escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
}

// Register the custom element
if (!customElements.get('aparte-chat')) {
  customElements.define('aparte-chat', AparteChat);
}

declare global {
  interface HTMLElementTagNameMap {
    'aparte-chat': AparteChat;
  }
}
