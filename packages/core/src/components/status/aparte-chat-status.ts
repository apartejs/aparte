import { AparteConfig } from '../../config/aparte-config.js';
import { resolveConfig, runWithConfig } from '../../config/config-context.js';

/**
 * A standalone status line — a light-DOM indicator the APP owns. Nothing in core turns
 * it on: the framework host only ever flips it back OFF (on the first streamed token),
 * and the four wrappers render one inside the viewport driven by their own `isTyping`
 * prop.
 *
 * It dispatches nothing, deliberately: it reports, it does not ask.
 *
 * Use it for a state only the app knows about — "Searching the docs…", "Uploading…",
 * a queue position. It is NOT the indicator for the gap between a send and the first
 * token: that one is built into the bubble (`.aparte-waiting`, shown while `streaming`
 * is set on a non-user bubble that has nothing to display yet). Turning this element on
 * for that gap is how a page ends up showing two indicators for one wait.
 *
 * It does not project children: `_render()` writes the subtree — a
 * `.aparte-status-container` row holding an empty avatar div and an `.aparte-body` that
 * wraps `.aparte-status-content` — so markup authored between the tags does not
 * survive. That avatar div never gets contents here, and `.aparte-avatar:empty` is
 * `display: none`, so it is not a spacer: the line sits flush with the row padding
 * rather than indented under an assistant bubble's text column.
 *
 * The seam for custom contents is `setStatusRenderer`, scoped or global: the container
 * keeps owning show/hide (`data-visible`), the accessible name (`aria-label`) and its
 * `.aparte-message` row metrics whatever the renderer returns, but the pulsing dot and
 * the text node belong to the default path only.
 *
 * A `text` attribute renders the visible label and feeds the accessible name; with no
 * `text` the line is dots-only and the name falls back to the literal `Typing` — this
 * element does not read the locale. Hiding happens twice over: the host element is
 * `display: none` without `[visible]`, and `data-visible` drives the fade/translate on
 * the container.
 *
 * The config is resolved live rather than cached, so a `setStatusRenderer` call that
 * lands after this element has already upgraded still reaches it: the element
 * re-renders on `aparte-config-change`, filtered to its own config.
 *
 * The two borrowed row variables below have one scope caveat: inside a viewport
 * narrower than 520px core REASSIGNS `--aparte-message-padding` on `.aparte-message`
 * itself, so a declaration on this host element loses to it there.
 *
 * @element aparte-chat-status
 * @attr {boolean} visible - Shows or hides the indicator.
 * @attr {string} text - The line to show. Absent, the line is dots-only and the
 *   accessible name falls back to the literal `Typing` (not the locale's string).
 *
 * @cssprop [--aparte-status-color=var(--aparte-text-muted)] - Colour of the label text and of the pulsing dot in the default line.
 * @cssprop [--aparte-status-font-size=var(--aparte-font-size-md)] - Size of the visible label (italic by default) in the default line.
 * @cssprop [--aparte-status-dot-size=6px] - Diameter of the single pulsing dot in the default line.
 * @cssprop [--aparte-message-padding=var(--aparte-message-padding-block) var(--aparte-message-padding-inline)] - Padding of the row, read because the container also carries `.aparte-message` — the status line borrows a bubble's row metrics so it lines up with the transcript.
 * @cssprop [--aparte-message-max-width=800px] - Width cap of that same row.
 *
 * @example
 * <!-- The app owns this indicator: core turns it on for nobody, which is also why it
 *      is the wrong tool for the wait before the first token — the bubble's built-in
 *      waiting state already covers that one. -->
 * <aparte-chat-status visible text="Searching the docs…"></aparte-chat-status>
 */
export class AparteChatStatus extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['visible', 'text'];
  }

  /**
   * Resolved LIVE, not cached. Caching it at connect made this element
   * permanently deaf to its own instance: `_onConfigChange` filters on
   * `detail.config !== this._cfg`, so once `_cfg` had latched the global config no
   * change for the real instance ever matched, and the filter meant to isolate
   * chats became the thing that silenced one.
   */
  private get _cfg(): AparteConfig {
    return resolveConfig(this);
  }

  constructor() {
    super();
  }

  connectedCallback(): void {
    // Cache the resolved config (instance boundary or global fallback), like the
    // other Aparte elements — so a scoped setStatusRenderer applies here too.
    this._render();
    // Re-render on a live config change (e.g. setStatusRenderer called after this
    // element already upgraded — it self-registers on import, so a persistent
    // <aparte-chat-status> in the page mounts before any config runs). Mirrors the
    // bubble's config-change subscription.
    window.addEventListener('aparte-config-change', this._onConfigChange);
  }

  disconnectedCallback(): void {
    window.removeEventListener('aparte-config-change', this._onConfigChange);
  }

  private _onConfigChange = (e: Event): void => {
    // Only react to OUR config (an instance-scoped change elsewhere must not touch
    // us). A bare notify (no detail.config) always re-renders.
    const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
    if (detail?.config && detail.config !== this._cfg) return;
    // Clear so _render's re-entrancy guard doesn't bail; visible/text are read
    // from attributes, so the shown state is preserved across the re-render.
    this.innerHTML = '';
    this._render();
  };

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'visible':
        this._updateVisibility(newValue !== null);
        break;
      case 'text':
        this._updateText(newValue);
        break;
    }
  }

  /**
   * Show the typing indicator
   */
  show(): void {
    this.setAttribute('visible', '');
  }

  /**
   * Hide the typing indicator
   */
  hide(): void {
    this.removeAttribute('visible');
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.hasAttribute('visible')) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.hasAttribute('visible');
  }

  private _render(): void {
    const text = this.getAttribute('text') || 'Typing';
    const visible = this.hasAttribute('visible');

    // Re-entrancy check
    if (this.querySelector('.aparte-status-container')) return;

    // Custom typing indicator (charter §6 render hook): replace the inner markup
    // while the container keeps owning show/hide (data-visible) + accessible name.
    const custom = this._cfg?.getStatusRenderer?.();
    if (custom) {
      this.innerHTML =
        `<div class="aparte-message aparte-status-container" data-visible="${visible}" role="status" aria-live="polite"></div>`;
      const container = this.querySelector('.aparte-status-container') as HTMLElement;
      // `text` set via setAttribute, never interpolated — a `"` would break out.
      container.setAttribute('aria-label', text);
      const result = runWithConfig(this._cfg, () => custom(text));
      if (result instanceof HTMLElement) container.appendChild(result);
      else container.innerHTML = result;
      return;
    }

    this.innerHTML = `
      <div
        class="aparte-message aparte-status-container"
        data-visible="${visible}"
        role="status"
        aria-live="polite"
      >
        <div class="aparte-avatar" data-role="assistant" style="visibility: hidden"></div>
        <div class="aparte-body">
          <div class="aparte-status-content">
            <div class="aparte-dots" aria-hidden="true">
              <span class="aparte-dot"></span>
            </div>
            <span class="aparte-status-text"></span>
          </div>
        </div>
      </div>
    `;
    // Set the (public, attacker-controllable) `text` via setAttribute/textContent
    // rather than interpolating it into the innerHTML template — a `"` in the
    // attribute would otherwise break out and inject arbitrary attributes.
    this.querySelector('.aparte-status-container')?.setAttribute('aria-label', text);
    // Visible text only when explicitly requested — the default stays dots-only
    // (the aria-label above always carries the accessible name).
    if (this.hasAttribute('text')) {
      const textEl = this.querySelector('.aparte-status-text');
      if (textEl) textEl.textContent = text;
    }
  }

  private _updateVisibility(visible: boolean): void {
    const container = this.querySelector('.aparte-status-container');
    if (container) {
      container.setAttribute('data-visible', String(visible));
    }
  }

  private _updateText(text: string | null): void {
    const textEl = this.querySelector('.aparte-status-text');
    const container = this.querySelector('.aparte-status-container');
    if (!container) return; // not rendered yet — _render() reads the attribute
    // Removing the attribute restores the dots-only default (empty visible
    // text); the aria-label always keeps an accessible name.
    if (textEl) textEl.textContent = text ?? '';
    container.setAttribute('aria-label', text || 'Typing');
  }
}

// Register the custom element
if (!customElements.get('aparte-chat-status')) {
  customElements.define('aparte-chat-status', AparteChatStatus);
}
