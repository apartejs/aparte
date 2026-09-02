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
 * element does not read the locale. The container is a polite live region, and a live
 * region announces its CONTENT, not its `aria-label`: so the word also goes INTO the
 * region, in the visible span when `text` is set and in a screen-reader-only span when
 * it is not. Exactly one of the two is ever populated — both would be read twice. That
 * fallback word is driven by `visible`, not written once at render: a live region is
 * announced when its content CHANGES while it is exposed, and every wrapper mounts this
 * element hidden and flips the attribute — so a word written at render time is a word
 * the region already held when it appeared, the reveal-from-`display: none` path, which
 * is the one screen readers are documented not to announce reliably.
 * Hiding happens twice over: the host element is
 * `display: none` without `[visible]`, and `data-visible` drives the fade/translate on
 * the container.
 *
 * The config is resolved live rather than cached, so a `setStatusRenderer` call that
 * lands after this element has already upgraded still reaches it: the element
 * re-renders on `aparte-config-change`, filtered to its own config.
 *
 * The two borrowed row variables below have one scope caveat: inside a viewport
 * narrower than 520px core REASSIGNS `--aparte-message-padding-block` and
 * `--aparte-message-padding-inline` on `.aparte-message` itself, so a declaration on
 * this host element loses to them there.
 *
 * @element aparte-chat-status
 * @attr {boolean} visible - Shows or hides the indicator.
 * @attr {string} text - The line to show. Absent, the line is dots-only and the
 *   accessible name falls back to the literal `Typing` (not the locale's string).
 *
 * @cssprop [--aparte-status-color=var(--aparte-text-muted)] - Colour of the label text and of the pulsing dot in the default line.
 * @cssprop [--aparte-status-font-size=var(--aparte-font-size-md)] - Size of the visible label (italic by default) in the default line.
 * @cssprop [--aparte-status-dot-size=6px] - Diameter of the single pulsing dot in the default line.
 * @cssprop [--aparte-message-padding-block=var(--aparte-space-8)] - Vertical padding of the row, read because the container also carries `.aparte-message` — the status line borrows a bubble's row metrics so it lines up with the transcript.
 * @cssprop [--aparte-message-padding-inline=var(--aparte-space-6)] - Horizontal padding of the row, same reason.
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
            <span class="aparte-sr-only aparte-status-sr"></span>
          </div>
        </div>
      </div>
    `;
    // Set the (public, attacker-controllable) `text` via setAttribute/textContent
    // rather than interpolating it into the innerHTML template — a `"` in the
    // attribute would otherwise break out and inject arbitrary attributes.
    this.querySelector('.aparte-status-container')?.setAttribute('aria-label', text);
    this._writeText(this.getAttribute('text'));
  }

  /**
   * The one writer for both text nodes, so exactly ONE of them is ever populated.
   *
   * The container is a polite live region, and a live region announces its CONTENT.
   * The dots-only default had none — an `aria-hidden` dot and an empty span — so the
   * whole state rode on `aria-label`, which names the region rather than reporting it,
   * and nothing was announced. The screen-reader span carries the fallback word in that
   * case; when `text` is set the visible span already carries the same string, and
   * populating both would have the region read it twice.
   */
  private _writeText(text: string | null): void {
    // `text=""` is the dots-only default too — and it is the reading the post-mount
    // path already took, where mounting with an empty attribute used to print the
    // literal `Typing` on screen. One writer, one answer.
    const line = text || null;
    const textEl = this.querySelector('.aparte-status-text');
    if (textEl) textEl.textContent = line ?? '';
    this._syncLiveWord();
  }

  /**
   * The fallback word enters and leaves the live region WITH the element's visibility.
   *
   * Writing it at render time put it in the region while the host was still
   * `display: none` — every wrapper mounts `<aparte-chat-status>` once and flips
   * `visible` — so by the time the region was exposed its content had not changed, and
   * on the second and third turn there was not even a reveal to notice: the text was
   * byte-identical to what was already sitting there. Revealing a region that already
   * holds its text is the path assistive tech is documented not to announce reliably;
   * mutating one that is already exposed is the path that works. So the word is written
   * when `visible` arrives and cleared when it leaves, which makes every turn a real
   * change.
   *
   * With `text` set the visible span is the region's content and the screen-reader span
   * stays empty — one copy, read once.
   */
  private _syncLiveWord(): void {
    const srEl = this.querySelector('.aparte-status-sr');
    if (!srEl) return;
    const dotsOnly = !this.getAttribute('text');
    srEl.textContent = dotsOnly && this.hasAttribute('visible') ? 'Typing' : '';
  }

  private _updateVisibility(visible: boolean): void {
    const container = this.querySelector('.aparte-status-container');
    if (container) {
      container.setAttribute('data-visible', String(visible));
    }
    // The word is the news, and news is only heard while the region is on screen.
    this._syncLiveWord();
  }

  private _updateText(text: string | null): void {
    const container = this.querySelector('.aparte-status-container');
    if (!container) return; // not rendered yet — _render() reads the attribute
    // Removing the attribute restores the dots-only default (no visible text, the
    // fallback word in the live region); the aria-label always keeps an accessible name.
    this._writeText(text);
    container.setAttribute('aria-label', text || 'Typing');
  }
}

// Register the custom element
if (!customElements.get('aparte-chat-status')) {
  customElements.define('aparte-chat-status', AparteChatStatus);
}
