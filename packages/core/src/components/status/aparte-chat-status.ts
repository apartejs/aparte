/**
 * AparteChatStatus - The Indicator
 * 
 * Lightweight typing indicator with elegant animation.
 * Uses Light DOM for global CSS styling.
 * 
 * @element aparte-chat-status
 * @attr {boolean} visible - Show/hide the indicator
 * @attr {string} text - Custom text (default: "Typing...")
 */
import { AparteConfigClass } from '../../config/aparte-config.js';
import { resolveConfig, runWithConfig } from '../../config/config-context.js';

export class AparteChatStatus extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['visible', 'text'];
  }

  private _cfg!: AparteConfigClass;

  constructor() {
    super();
  }

  connectedCallback(): void {
    // Cache the resolved config (instance boundary or global fallback), like the
    // other Aparte elements — so a scoped setStatusRenderer applies here too.
    this._cfg = resolveConfig(this);
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

declare global {
  interface HTMLElementTagNameMap {
    'aparte-chat-status': AparteChatStatus;
  }
}
