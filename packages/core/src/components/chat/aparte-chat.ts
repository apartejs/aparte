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
 * The container element for a chat. It lays out its Light DOM children as a flex
 * column: an `<aparte-chat-viewport>` takes the space left over (`flex: 1 1 auto`)
 * and scrolls, an `<aparte-composer>` keeps its own height below it. Light DOM on
 * purpose, so the page's own global CSS reaches inside.
 *
 * The presence of an `<aparte-chat-viewport>` child at connect is the exact test for
 * "the author composed this". Find one and the children are used as given — this
 * element moves none of them, so anything else you drop in (a header, a banner above
 * the composer) is simply another row of that column, in DOM order. Find none and
 * `innerHTML` is OVERWRITTEN with a default composition — a viewport, an
 * `<aparte-elicitation>` presenter, and a composer shell holding an input and a send
 * button, plus the two attachment primitives when `attachments` is set — so children
 * written without a viewport anywhere inside them are destroyed, that header included.
 * The test is a DESCENDANT query, so a viewport nested in a wrapper of your own still
 * counts — compose it yourself with the viewport somewhere in the tree, or leave the tag
 * empty. Angular's wrapper sets `framework-managed` instead of relying on that test,
 * because its children do not exist yet when this element upgrades; React, Vue and
 * Svelte never create this element at all, so the question does not arise for them.
 *
 * Being a component (not a bare `<div>`), it also owns behaviour a wrapper div
 * can't: with `center-empty`, it watches its own viewport and keeps the composer
 * centered as a welcome state until the first `<aparte-chat-bubble>` lands, then
 * slides to the normal layout — no external JavaScript (`data-empty`, in the attribute
 * list below, is that watcher's output). The watcher needs a viewport somewhere
 * inside, and hand-written markup always has one because composing the default injects
 * it — so the only path where no watcher starts and `data-empty` is never set is
 * `framework-managed`, where the framework owns the subtree anyway. The stylesheet
 * centers through
 * `aparte-chat[center-empty][data-empty]` and its DIRECT viewport child, so a
 * framework-managed host that nests the viewport inside a container of its own gets
 * nothing from the attribute — the wrappers ship their own centered layout.
 *
 * It is also one of the anchors where core re-declares its derived CSS layer, so
 * overriding a master — `--aparte-primary`, a surface, a text colour — on a single
 * `<aparte-chat>` re-derives the values computed from it for that instance rather
 * than moving one button. That is per-instance theming. The literal palette is
 * deliberately not re-declared here, so a chat nested in a dark wrapper stays dark.
 *
 * Presentational only: it does NOT wire a transport/client. Attach an
 * `AparteClient`, or handle `aparte-send` yourself, as with the primitives.
 * Size the element via CSS (a height, or let it fill a sized parent).
 *
 * Composing it yourself is the other form, and the container still lays it out and still
 * runs `center-empty`. It is written out here rather than as a second `@example` for a
 * mechanical reason: every element-own example is concatenated into ONE live frame on the
 * generated reference page, so a second `<aparte-chat>` there rendered as a second whole
 * chat — two empty composers with 600px of nothing between them.
 *
 * ```html
 * <aparte-chat center-empty attachments style="height: 24rem">
 *   <aparte-chat-viewport></aparte-chat-viewport>
 *   <aparte-composer>
 *     <div class="aparte-composer-shell">
 *       <div class="aparte-composer-row">
 *         <aparte-composer-input></aparte-composer-input>
 *         <aparte-composer-send></aparte-composer-send>
 *       </div>
 *     </div>
 *   </aparte-composer>
 * </aparte-chat>
 * ```
 *
 * @element aparte-chat
 * @attr {string} placeholder - Placeholder for the composer input (default composition)
 * @attr {boolean} disabled - Disables the composer
 * @attr {boolean} submit-on-enter - Forwarded to the composer by value: `submit-on-enter="false"`
 *   makes Enter break the line and Shift+Enter send (the bare attribute, or none, keeps the
 *   default — Enter sends). The four wrappers expose the same switch as `submitOnEnter`.
 * @attr {boolean} center-empty - Center the composer as a welcome state until the first message, then slide to the normal layout
 * @attr {boolean} data-empty - Reflected BY the element while `center-empty` is set and no
 *   `<aparte-chat-bubble>` has landed in its viewport; the stylesheet centers the composer through
 *   `aparte-chat[center-empty][data-empty]`, and an app styles its welcome state against it. Never
 *   set without `center-empty`, and never under `framework-managed` (no viewport child to watch).
 *   Read-only.
 * @attr {boolean} overlay-composer - The ChatGPT anatomy, opt-in: the transcript's scroll
 *   surface spans the whole column and the composer (with the rest of the bottom stack)
 *   floats over it, so the scrollbar runs edge to edge instead of stopping at the
 *   composer's top. The viewport measures the stack and publishes
 *   `--aparte-bottom-inset`; content, spacer and the scroll button clear it. Read when
 *   the viewport wires its observers — set it in the initial markup. Also honoured on a
 *   wrapper's `[data-aparte-chat]` root.
 * @attr {boolean} framework-managed - The wrapper's explicit hands-off signal: set it and this
 *   element composes none of its own children, because the framework owns them. Read once at
 *   connect (it is not observed), so it has to be in the initial markup. Angular's wrapper sets
 *   it on this element — its component selector IS `aparte-chat`; React/Vue/Svelte render a
 *   `[data-aparte-chat]` div and never create this element at all.
 * @attr {boolean} attachments - Add the file picker + chips strip to the default composition (opt-in: the host must consume the files — an `AparteClient` does, a hand-rolled loop must read `event.detail.files`)
 *
 * @cssprop [--aparte-chat-bottom-gap=var(--aparte-space-8)] - Space below the
 *   composer, as `padding-block-end` on the shell (the same rule covers a wrapper's
 *   `[data-aparte-chat]` root). The gap belongs to this element because padding applied
 *   from outside would also shrink the scroll area, stopping the transcript short of the
 *   edge instead of scrolling to it.
 *
 * @example
 * <!-- Left empty it fills in a viewport, an input and a send button. -->
 * <aparte-chat center-empty placeholder="Say something…" style="height: 24rem"></aparte-chat>
 *
 * <script>
 *   // Seeded so the frame shows a real exchange rather than an empty box: this
 *   // example is RENDERED, not only read.
 *   const chat = document.querySelector('aparte-chat');
 *   chat.viewport.appendMessage({ id: 'u1', role: 'user', content: 'What is a transport?' });
 *   chat.viewport.appendMessage({
 *     id: 'a1',
 *     role: 'assistant',
 *     content: 'The object that talks to the model. Swap it and the UI does not change.',
 *   });
 * </script>
 */
export class AparteChat extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['placeholder', 'disabled', 'submit-on-enter', 'center-empty', 'attachments'];
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
    this._forwardAttr('submit-on-enter');
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
