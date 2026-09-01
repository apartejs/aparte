import type {
  AparteBubbleRole,
  AparteSegment,
  AparteAttachment,
  AparteBranchNavigateEventDetail,
  AparteLinkClickEventDetail,
  AparteRetryEventDetail,
  AparteEditEventDetail,
  AparteFeedbackEventDetail,
  AparteActionEventDetail,
  AparteMessageInfoEventDetail,
  AparteUsage,
  AparteMessage,
} from '../../types/index.js';
import { getSegmentRenderer, installDefaultRenderersOnce } from '../../renderers/index.js';
import { writeStreamedMarkdown, type AparteMarkdownStreamHost } from '../../renderers/markdown-stream.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { resolveConfig, runWithConfig } from '../../config/config-context.js';
import { cssEscape } from '../../utils/css-escape.js';
import { copyText } from '../../utils/copy-text.js';
import { mergeSegmentUpdate } from '../../utils/segments.js';
import type { AparteComposerInput } from '../composer/aparte-composer-input.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';

/**
 * Warn ONCE when a segment has no renderer — now only for types core has never
 * heard of, since the built-ins install themselves on first use.
 */
let _warnedNoRenderer = false;
function warnMissingRenderer(type: string): void {
    if (_warnedNoRenderer) return;
    _warnedNoRenderer = true;
    console.warn(`[aparte] No renderer for segment "${type}". Register one with registerSegmentRenderer({ type: '${type}', render }) from @aparte/core — see https://apartejs.dev/guides/customization/#custom-segment-types`);
}

/**
 * What a segment renders as when no renderer claims its type.
 *
 * `AparteCustomSegment.fallback` is documented as "Optional fallback text
 * representation" and was read by NOTHING — the field existed, the type published it,
 * and a custom segment arriving where its renderer is not registered (a conversation
 * replayed in another app, a client that loads its views lazily, an export) showed
 * `[Unknown segment type: custom]` while carrying the sentence written for exactly that
 * moment. Found while writing the segment's own `@example`, which is the kind of dead
 * declaration documentation is good at surfacing.
 *
 * The developer warning is skipped when a fallback is present: an author who supplied
 * one has already said this can happen, and warning then is crying wolf. Without one it
 * still fires, because a missing renderer is otherwise silent.
 *
 * `textContent`, so a fallback is text and cannot carry markup — the same rule the rest
 * of the library follows for anything a model or a host can produce.
 */
function unrenderedSegment(segment: { type: string; fallback?: unknown }): HTMLElement {
  const fallback = typeof segment.fallback === 'string' && segment.fallback.trim() ? segment.fallback : null;
  if (!fallback) warnMissingRenderer(segment.type);
  const el = document.createElement('div');
  el.className = fallback ? 'aparte-segment aparte-segment-fallback' : 'aparte-segment aparte-segment-unknown';
  el.textContent = fallback ?? `[Unknown segment type: ${segment.type}]`;
  return el;
}

/**
 * The renderer for `type`, installing core's built-ins the first time a segment
 * finds the registry empty of its type. `registerDefaultRenderers()` therefore
 * becomes optional rather than a call you discover by seeing
 * `[Unknown segment type: text]` on screen (it is still honoured, and
 * `AparteClient({ autoRegister: false })` still keeps the built-ins out).
 */
function resolveSegmentRenderer(
    type: string,
    config: AparteConfig,
): ReturnType<typeof getSegmentRenderer> {
    // The CONFIG is passed in, not read ambiently.
    //
    // `runWithConfig` wrapped only `render` / `setup` / `update`, so the renderer's
    // OWN work was per-instance while the question "which renderer is this?" was
    // answered from a module-level registry. Two chats on a page therefore shared
    // their segment renderers no matter what `config` prop the wrapper was given —
    // half of the promise those props make.
    const renderer = getSegmentRenderer(type, config);
    if (renderer) return renderer;
    installDefaultRenderersOnce(config);
    return getSegmentRenderer(type, config);
}

/**
 * Normalize a segment renderer's output to a single element. Renderers may return
 * an HTML **string** (parsed via innerHTML — the built-in renderers) or a ready
 * **HTMLElement** (used directly, so custom renderers can wire event listeners /
 * framework nodes with no innerHTML XSS surface). See {@link AparteSegmentRenderer}.
 */
function segmentRenderResultToElement(result: string | HTMLElement, segment?: Pick<AparteSegment, 'id'>): HTMLElement | null {
    let el: HTMLElement | null;
    if (result instanceof HTMLElement) {
        el = result;
    } else {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = result;
        el = wrapper.firstElementChild as HTMLElement | null;
    }
    // The container finds its own children by id — this is where that invariant is
    // owned, for both arms and for every renderer, not each renderer's to remember.
    // A root without it made `_applySegmentUpdate` miss and fall back to the full
    // wipe-and-rebuild, which destroys a mounted artifact preview, collapses an
    // opened reasoning block and drops the focus — the ask_user receipt did exactly
    // that on every tool update, since `AparteToolRenderer`'s contract never said so.
    if (el && segment && !el.hasAttribute('data-segment-id')) el.setAttribute('data-segment-id', segment.id);
    return el;
}

/**
 * One message: plain content or a list of rich segments, in light DOM.
 *
 * Normally created for you by `<aparte-chat-viewport>`, one per message in the store;
 * you write the tag by hand only when you drive the DOM yourself. It is ONE message
 * with one role — a transcript is the viewport's job, and a bubble is not a
 * general-purpose card.
 *
 * **Not a slot host.** `_render()` writes its own markup into the light DOM on
 * connect, so children placed inside the tag are replaced rather than projected.
 * Everything customizable is a registered hook instead of a child: the structural
 * shell (`setBubbleShellRenderer` — it must root at `.aparte-message` and carry the
 * region hooks, since every query here is null-guarded and a partial shell silently
 * loses that region), the avatar (`setAvatarProvider`), the attachment chips
 * (`setAttachmentRenderer`), the `‹1/2›` position indicator
 * (`setSiblingNavRenderer`) and the body itself (`registerSegmentRenderer`).
 *
 * Two content paths, mutually exclusive: the `content` attribute (plain text run
 * through the configured Markdown provider, then highlighted once — after streaming
 * ends, not per token) and `setSegments()` / `addSegment()`. Segments win:
 * `.aparte-content` stays hidden for as long as any exist. The painted
 * `.aparte-message-content` box hides itself when there is nothing in it, so a
 * message that is only attachments is not a coloured rectangle.
 *
 * The bubble owns no transport and no host behaviour. The action bar and the branch
 * picker only dispatch the events below; nothing here retries a turn, persists an
 * edit, opens a stats popover or switches a branch. Which buttons exist follows from
 * that: `copy` is on by default, `edit` / `retry` / `feedback` need
 * `setBubbleActions`, `info` needs both that flag and a prior `setUsage()` (a details
 * button over no numbers is a dead button), and an image attachment becomes a preview
 * button only once `setHostHandlers` declares a lightbox — undeclared it stays a
 * picture, with no role, tab stop or pointer.
 *
 * The error state is derived from the segments (an `error` segment sets `data-error`
 * on `.aparte-message`), never from a status attribute, so it behaves identically in
 * vanilla and in every wrapper.
 *
 * All seven events are declared by hand rather than left to the analyser, which
 * found six. `aparte-branch-navigate` is dispatched from the `_onBranchPickerClick`
 * arrow class field, and the auto-detection visits `ts.isMethodDeclaration` only —
 * so the one event belonging to the branch picker was the one missing from the
 * manifest, and from the generated reference, for as long as both existed.
 *
 * @element aparte-chat-bubble
 *
 * @attr {string} data-role - The message role, `user` or `assistant` — the one channel for it, and what the CSS keys off. (`role` is ARIA's attribute; this element sets it to `article` itself and no longer reads a message role from it.)
 * @attr {string} content - Plain text content, for a bubble with no segments.
 * @attr {number | string} timestamp - Epoch milliseconds OR a date string: `_updateTimestamp` accepts either and only coerces when the value is numeric.
 * @attr {string} message-id - How streaming and the action bar address this bubble.
 * @attr {boolean} streaming - Hides the action bar and shows the caret while a reply is in flight.
 * @attr {string} name - The display name in the header.
 *
 * @fires {CustomEvent<AparteActionEventDetail>} aparte-action - A custom action-bar button was pressed.
 * @fires {CustomEvent<AparteRetryEventDetail>} aparte-retry - Retry was pressed; the host forks the turn.
 * @fires {CustomEvent<AparteEditEventDetail>} aparte-edit - An edit was saved.
 * @fires {CustomEvent<AparteFeedbackEventDetail>} aparte-feedback - Thumbs up or down.
 * @fires {CustomEvent<AparteMessageInfoEventDetail>} aparte-message-info - The info affordance was pressed.
 * @fires {CustomEvent<AparteBranchNavigateEventDetail>} aparte-branch-navigate - The `‹1/2›` picker moved between sibling versions.
 * @fires {CustomEvent<AparteAttachmentPreviewEventDetail>} aparte-attachment-preview - An attached image was clicked, asking the app to open it full-size.
 * @fires {CustomEvent<AparteLinkClickEventDetail>} aparte-link-click - A link in the message body is about to be followed. Cancelable: `preventDefault()` keeps the browser from navigating, so a host can route the link itself.
 *
 * @cssprop [--aparte-message-gap=12px] - Gap between the avatar column and the body (the viewport reuses it between messages).
 * @cssprop [--aparte-message-padding=16px 12px] - Padding around one message row.
 * @cssprop [--aparte-message-max-width=800px] - Width of the centred message row.
 *
 * @cssprop [--aparte-message-content-radius=14px] - Radius of the painted content box.
 * @cssprop [--aparte-message-content-padding=10px 14px] - Padding of the USER box only; the assistant's content is plain full-width prose.
 * @cssprop --aparte-message-content-bg-user - Background of the user box: a wash of `--aparte-primary` over `--aparte-surface-1`, derived in `theme.css` so a rebrand moves it (declare it to override).
 * @cssprop [--aparte-message-content-bg-assistant=transparent] - Background of the assistant box — transparent on purpose (AI-chat convention, not messaging).
 * @cssprop [--aparte-message-content-text-user=var(--aparte-text)] - Text colour inside the user box.
 * @cssprop [--aparte-message-content-text-assistant=var(--aparte-text)] - Text colour inside the assistant box.
 *
 * @cssprop [--aparte-avatar-size=32px] - Square size of the avatar slot.
 * @cssprop [--aparte-avatar-radius=var(--aparte-radius-avatar)] - Avatar corner radius.
 * @cssprop [--aparte-avatar-font-size=14px] - Size of the initial, for a shell that renders one (the default shell leaves the slot empty, and `.aparte-avatar:empty` hides it).
 * @cssprop [--aparte-avatar-bg-user=var(--aparte-primary)] - Avatar background, user role.
 * @cssprop [--aparte-avatar-text-user=var(--aparte-text-inverse)] - Avatar text colour, user role.
 * @cssprop [--aparte-avatar-bg-assistant=var(--aparte-surface-3)] - Avatar background, assistant role.
 * @cssprop [--aparte-avatar-text-assistant=var(--aparte-text-inverse)] - Avatar text colour, assistant role.
 * @cssprop [--aparte-avatar-image-user=none] - `background-image` for the user avatar — a logo with no AvatarProvider and no JS.
 * @cssprop [--aparte-avatar-image-assistant=none] - `background-image` for the assistant avatar.
 * @cssprop [--aparte-avatar-image-size=90%] - `background-size` for both avatar images.
 *
 * @cssprop [--aparte-name-font-size=14px] - Sender name in the header.
 * @cssprop [--aparte-name-color=var(--aparte-text)] - Sender name colour.
 * @cssprop [--aparte-timestamp-font-size=12px] - Timestamp in the header.
 * @cssprop [--aparte-timestamp-color=var(--aparte-text-muted)] - Timestamp colour.
 * @cssprop [--aparte-content-font-size=15px] - Body type size, applied to both the plain-content and the segments container.
 * @cssprop [--aparte-content-color=var(--aparte-text)] - Body text colour.
 * @cssprop [--aparte-content-line-height=var(--aparte-line-height-loose)] - Body line height.
 *
 * @cssprop [--aparte-attachments-max-height=140px] - Cap on the sent-attachment strip; past it the strip scrolls instead of growing.
 * @cssprop [--aparte-attachment-image-size=40px] - Tile size in the strip. The strip re-declares the global 72px down to 40px, since these are thumbnails inside a conversation.
 * @cssprop [--aparte-thumb-radius=var(--aparte-radius-lg)] - Attachment tile radius (shared with the composer's preview tiles).
 * @cssprop [--aparte-thumb-name-color=#ffffff] - Filename overlaid on a tile.
 * @cssprop --aparte-thumb-name-scrim - Gradient behind that filename, so it stays legible over any image.
 * @cssprop [--aparte-thumb-name-padding=14px 5px 4px] - Padding of the filename overlay.
 *
 * @cssprop [--aparte-action-bar-gap=4px] - Gap between action buttons (and between the footer's two regions).
 * @cssprop [--aparte-action-bar-btn-size=28px] - Square size of an action button; also the footer's reserved height.
 * @cssprop [--aparte-action-bar-btn-color=var(--aparte-text-muted)] - Action icon colour at rest.
 * @cssprop [--aparte-action-bar-btn-hover-bg=var(--aparte-surface-2)] - Action button hover background (the branch arrows reuse it).
 * @cssprop [--aparte-action-bar-btn-hover-color=var(--aparte-text)] - Action icon colour on hover.
 *
 * @cssprop [--aparte-branch-picker-gap=4px] - Gap between the arrows and the position label.
 * @cssprop [--aparte-branch-picker-btn-size=20px] - Square size of each arrow.
 * @cssprop [--aparte-branch-picker-btn-icon-size=16px] - Glyph size inside an arrow.
 * @cssprop [--aparte-branch-picker-btn-color=var(--aparte-text-muted)] - Arrow colour at rest.
 * @cssprop [--aparte-branch-picker-btn-hover-color=var(--aparte-text)] - Arrow colour on hover (a disabled arrow is dimmed instead).
 * @cssprop [--aparte-branch-picker-label-size=12px] - Type size of the position label.
 * @cssprop [--aparte-branch-picker-label-color=var(--aparte-text-muted)] - Colour of the position label.
 * @cssprop [--aparte-branch-picker-label-min-width=32px] - Reserved label width, so `9 / 9` growing to `10 / 12` does not shift the arrows.
 *
 * @cssprop [--aparte-waiting-height=1.5em] - Min height of the waiting region, so the first token does not jump the layout.
 * @cssprop [--aparte-waiting-dot-gap=4px] - Gap between the three waiting dots.
 * @cssprop [--aparte-status-dot-size=6px] - Diameter of a waiting dot (shared with the status indicator).
 * @cssprop [--aparte-status-color=var(--aparte-text-muted)] - Colour of the waiting dots (shared with the status indicator).
 *
 * @cssprop [--aparte-error-solid=#dc2626] - Ring drawn around the avatar while `data-error` is set. The error CARD itself belongs to the error segment renderer.
 *
 * @example
 * <!-- Rendered for you by the viewport. Written by hand only when you drive the DOM
 *      yourself: `message-id` is what streaming and the action bar address it by. -->
 * <aparte-chat-bubble
 *   message-id="a1"
 *   data-role="assistant"
 *   name="Assistant"
 *   content="Hello."
 * ></aparte-chat-bubble>
 *
 * <!-- While a reply is in flight: `streaming` hides the action bar and shows the caret. -->
 * <aparte-chat-bubble message-id="a2" data-role="assistant" streaming></aparte-chat-bubble>
 *
 * <!-- One reply among several. `setSiblings(count, index)` is what draws the picker, and
 *      it is a METHOD, not an attribute — so a branch cannot be shown by markup alone.
 *      Retry forks a sibling instead of overwriting the reply, and this is the control
 *      that walks them; each press dispatches `aparte-branch-navigate` for a host to
 *      answer. Kept in the example because a guide that describes branching has no other
 *      way to SHOW it. -->
 * <aparte-chat-bubble
 *   message-id="a3"
 *   data-role="assistant"
 *   name="Assistant"
 *   content="A second take on the same question."
 * ></aparte-chat-bubble>
 *
 * <script>
 *   document.querySelector('aparte-chat-bubble[message-id="a3"]').setSiblings(2, 0);
 * </script>
 */
export class AparteChatBubble extends HTMLElement {
  private _contentEl: HTMLDivElement | null = null;
  private _segmentsEl: HTMLDivElement | null = null;
  private _attachmentsEl: HTMLDivElement | null = null;
  private _actionBarEl: HTMLDivElement | null = null;
  private _branchPickerEl: HTMLDivElement | null = null;
  private _footerEl: HTMLDivElement | null = null;
  private _content = '';
  private _streaming = false;
  private _segments: AparteSegment[] = [];
  private _role: AparteBubbleRole = 'assistant';
  private _attachments: AparteAttachment[] = [];
  private _usage: AparteUsage | null = null;
  /** Cleanup returned by the avatar provider — called on disconnect/re-render. */
  private _avatarCleanup: (() => void) | null = null;
  /** Sibling count for tree-based branch navigation (set by setSiblings()) */
  private _siblingCount = 1;
  /** Sibling index for tree-based branch navigation (set by setSiblings()) */
  private _siblingIndex = 0;
  /** True while the user-message inline editor is open. */
  private _editing = false;
  /** The live inline editor (the composer's contenteditable primitive), present only while `_editing`. */
  private _editInput: AparteComposerInput | null = null;

  static get observedAttributes(): string[] {
    // `data-role` is the ONE channel for the message role. `role` is ARIA's
    // attribute — this element writes `role="article"` on itself in _render() —
    // and it used to be read as a legacy message-role channel too, which meant
    // filtering our own "article" back out at every turn. A rename lands as a
    // rename pre-1.0, so the overload is gone.
    return ['data-role', 'content', 'timestamp', 'message-id', 'streaming', 'name'];
  }

  constructor() {
    super();
  }

  // Rebuild the action bar when the global config changes (e.g. a live skin
  // switch calling setBubbleActions / setIconProvider) so already-rendered
  // bubbles pick up the new per-role actions + icons without being re-created.
  private _onConfigChange = (e: Event): void => {
    // Only rebuild for OUR config. An instance-scoped change on another chat —
    // or a global change while we resolve to an instance — must not touch us.
    // A bare dispatch (no detail.config) always rebuilds (e.g. manual notify).
    const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
    if (detail?.config && detail.config !== this._cfg) return;
    this._updateActionBar();
    // Everything else the locale writes. A language switch is documented as live
    // ("mounted components re-render immediately"), and rebuilding only the action
    // bar delivered half of it: the labels changed language while the NAME still
    // read "You" and the branch arrows kept their old `aria-label` — a bilingual
    // bubble, fixed only by a reload (which rebuilds the element).
    this._updateName();
    this._updateLocalizedLabels();
    this._updateWaiting();
    // An avatar provider is config too, and it was the one provider a live change
    // never reached: swap the set and every bubble already on screen kept the old
    // one. `_renderAvatar` tears down the previous mount before re-mounting, so
    // calling it again is safe, and it no-ops when no provider is registered.
    this._renderAvatar();
    this._relabelSegments();
    // The clock, too. A tag change is a formatting change, so the timestamp has to
    // be re-rendered or the language switches around a 12-hour time that stays.
    this._updateTimestamp(this.getAttribute('timestamp'));
  };

  /**
   * Ask every rendered segment to re-read its config-derived text.
   *
   * Not `_renderSegments()`, which wipes the container and rebuilds: that destroys a
   * mounted artifact preview, reverts a reasoning block the reader expanded by
   * clicking `<summary>` (the DOM's real state is never written back to `collapsed`),
   * resets scroll inside long terminal panes, drops focus from an Approve/Reject
   * gate, and throws away the incremental Markdown parser's buffered lookahead
   * mid-stream — for a change that added no content. It also fires container-wide
   * childList mutations, which is what the viewport's observer reads as "scroll to
   * the bottom".
   *
   * `relabel` is the narrow alternative, bound by the same no-child-node rule as
   * `update()`. A renderer that has no config-derived text does not implement it,
   * and this loop simply skips it.
   */
  private _relabelSegments(): void {
    if (!this._segmentsEl) return;
    for (const segment of this._segments) {
      const renderer = resolveSegmentRenderer(segment.type, this._cfg);
      if (!renderer?.relabel) continue;
      const el = this._segmentsEl.querySelector(
        `:scope > [data-segment-id="${cssEscape(segment.id)}"]`,
      ) as HTMLElement | null;
      if (!el) continue;
      runWithConfig(this._cfg, () => renderer.relabel!(el, segment));
    }
  }

  /**
   * Re-apply the locale strings written straight into the markup by `_render()` —
   * the accessible names a screen reader reads, which nothing else refreshes.
   */
  private _updateLocalizedLabels(): void {
    const locale = this._cfg.getLocale();
    const set = (selector: string, label: string): void => {
      this.querySelector(selector)?.setAttribute('aria-label', label);
    };
    set('.aparte-branch-prev', locale.previousResponse ?? 'Previous response');
    set('.aparte-branch-next', locale.nextResponse ?? 'Next response');
    set('.aparte-action-bar', locale.messageActions ?? 'Message actions');
  }

  /**
   * Config governing this bubble: the instance config of the nearest
   * `[data-aparte-host]` boundary, else the global singleton. Resolved live
   * (a single `closest()`) rather than cached — the boundary may be attached
   * AFTER this bubble mounts (AparteChatHost.bind() runs post-mount), so a
   * connect-time cache would freeze the wrong config.
   */
  private get _cfg(): AparteConfig {
    return resolveConfig(this);
  }

  connectedCallback(): void {
    this._render();
    this._updateContent();
    // Populate the timestamp from the current attribute. Frameworks that set
    // attributes BEFORE the element is connected (e.g. the Svelte wrapper) fire
    // attributeChangedCallback while _render() hasn't created `.aparte-timestamp`
    // yet, so the initial time would otherwise stay blank. No-ops when the
    // attribute is absent (set later → attributeChangedCallback handles it).
    this._updateTimestamp(this.getAttribute('timestamp'));
    window.addEventListener('aparte-config-change', this._onConfigChange);
    // Delegated, so a re-render cannot lose a click on the branch arrows.
    this.addEventListener('click', this._onBranchPickerClick);
    this.addEventListener('click', this._onLinkClick);
  }

  disconnectedCallback(): void {
    window.removeEventListener('aparte-config-change', this._onConfigChange);
    this.removeEventListener('click', this._onBranchPickerClick);
    this.removeEventListener('click', this._onLinkClick);
    if (this._avatarCleanup) {
      try { this._avatarCleanup(); } catch { /* ignore */ }
      this._avatarCleanup = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'data-role':
        if (newValue === 'user' || newValue === 'assistant') {
          this._role = newValue as AparteBubbleRole;
          this._updateRole();
        }
        break;
      case 'content':
        this._content = newValue || '';
        // A replace, like setContent — see _resetMarkdownStream.
        this._resetMarkdownStream();
        this._updateContent();
        break;
      case 'timestamp':
        this._updateTimestamp(newValue);
        break;
      case 'streaming':
        this._updateStreaming(newValue !== null && newValue !== 'false');
        break;
      case 'name':
        this._updateName();
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Append a token chunk (for streaming) */
  appendToken(chunk: string): void {
    this._content += chunk;
    this._updateContent();
  }

  /** Set content directly */
  setContent(content: string): void {
    this._content = content;
    this.setAttribute('content', content);
    // A REPLACE, not an append: the incremental parser tracks how many characters it has
    // already written, so leaving its state behind would make the next token's delta a
    // slice of the wrong string. A retry does exactly this — clear, then re-stream.
    this._resetMarkdownStream();
    this._updateContent();
  }

  /**
   * Drop the incremental Markdown parser's state.
   *
   * Only needed where `_content` is REPLACED rather than grown. `appendToken` grows it, so
   * the parser's cursor stays valid there — which is the whole point of the seam.
   */
  private _resetMarkdownStream(): void {
    const host = this as AparteMarkdownStreamHost;
    if (host._aparteSmd) host._aparteSmd.renderer.end();
    host._aparteSmd = undefined;
  }

  /** Get current content */
  getContent(): string {
    return this._content;
  }

  /** Set segments for rich content */
  setSegments(segments: AparteSegment[]): void {
    /*
     * Copy the array IN, the way `getSegments()` already copies it OUT.
     *
     * That asymmetry was the bug: the bubble defended its list on the way out and
     * adopted the caller's on the way in. `populateBubbleFromMessage` hands over
     * `message.segments` — the repository's own array — so the bubble and the model
     * ended up advancing ONE array. `appendToSegment` then wrote each chunk twice:
     * the viewport replaced the slot with `{...segment, content: old + chunk}`, the
     * bubble looked the segment up in what it thought was its own list, found that
     * replacement (chunk already in it) and appended the chunk again. Measured:
     * "ThatThat  deletesdeletes  aa  filefile".
     *
     * This is the same failure 3b026bb fixed for `addSegment` — where it does not
     * happen, because the bubble pushes into a list it created itself, so the
     * viewport's replacement decouples the two immediately. A message arriving with
     * its segments already populated went around that fix, exactly as `AparteClient`
     * went around the one before it. One copy here closes the last shared array:
     * `setSegments` has a single production caller, so all three paths through
     * `populateBubbleFromMessage` are covered by this line.
     *
     * The objects stay shared, deliberately — that is the arrangement `addSegment`
     * produces and that `appendToSegment` is written for: the first write on either
     * side replaces its own slot and the two are independent from then on.
     */
    this._segments = [...segments];
    this._renderSegments();
    this._updateWaiting();
  }

  /** Add a segment */
  addSegment(segment: AparteSegment): void {
    this._segments.push(segment);
    this._appendSegmentEl(segment);
    this._updateWaiting();
  }

  /** Update a specific segment */
  updateSegment(segmentId: string, updates: Partial<AparteSegment>): void {
    const index = this._segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      const updated = mergeSegmentUpdate(this._segments[index]!, updates);
      this._segments[index] = updated;
      this._applySegmentUpdate(segmentId, updated, updates);
    }
  }

  /** Append content to a segment */
  appendToSegment(segmentId: string, content: string): void {
    const segment = this._segments.find(s => s.id === segmentId);
    if (segment && 'content' in segment) {
      (segment as { content: string }).content += content;
      this._applySegmentUpdate(segmentId, segment, { content: (segment as AparteSegment & { content: string }).content });
    }
  }

  /** Get all segments */
  getSegments(): AparteSegment[] {
    return [...this._segments];
  }

  /** Remove a segment by id (e.g. to discard a transient waiting indicator) */
  /**
   * Scoped to DIRECT children on purpose.
   *
   * Segments are appended as direct children of the container, but a descendant
   * query returns the first match in document order — and sanitized model
   * markdown renders inside that same container, with `data-*` attributes
   * deliberately preserved (they are inert). So a decoy `data-segment-id` planted
   * in an earlier segment's prose used to win over the real segment element.
   *
   * Parser ids are unguessable UUIDs, but a tool segment is `tool-${toolCallId}`
   * and the MODEL chooses that id — so this was reachable, and pointing an update
   * at a decoy left a rejected tool rendering as still-running: a spoof against
   * the human-in-the-loop control.
   */
  removeSegment(segmentId: string): void {
    const index = this._segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      this._segments.splice(index, 1);
    }
    const el = this._segmentsEl?.querySelector(`:scope > [data-segment-id="${cssEscape(segmentId)}"]`);
    el?.remove();
    this._updateWaiting();
  }

  /** Set attachments (chips shown above message content, user role only) */
  setAttachments(attachments: AparteAttachment[]): void {
    this._attachments = attachments;
    this._updateAttachments();
    // Attachments are content: a bubble that is only attachments must not be `data-empty`.
    this._updateWaiting();
  }

  /**
   * Set token usage + timing for this message (assistant only).
   *
   * This is the *precondition* for the info ("i") action, not the trigger: the
   * button appears only if the app also declared it wants it —
   * `aparteGlobalConfig.setBubbleActions({ info: true })` — because the stats popover it
   * opens (`aparte-message-info`) is the app's, and core has none. Without usage
   * there is nothing to show, so the button never renders either way.
   */
  setUsage(usage: AparteUsage | null | undefined): void {
    this._usage = usage ?? null;
    this._updateActionBar();
  }

  /**
   * Update the branch picker UI for tree-based navigation.
   * The viewport calls this after a branch switch or re-render.
   * Prev/Next clicks dispatch `aparte-branch-navigate` (bubbles: true) so
   * the viewport can handle the actual tree switch.
   */
  setSiblings(count: number, index: number): void {
    this._siblingCount = count;
    this._siblingIndex = index;
    this._updateBranchPicker();
  }

  /**
   * Atomic update for the message
   */
  updateMessage(updates: Partial<AparteMessage>): void {
    if ('role' in updates) {
      this._role = updates.role!;
      this._updateRole();
    }
    if ('content' in updates) {
      this._content = updates.content!;
      this._updateContent();
    }
    if ('segments' in updates) {
      // Copy IN, exactly as `setSegments` does and for the same reason: the
      // viewport `Object.assign`s this very array into the repo message before
      // forwarding it here, so adopting it by reference leaves one array with two
      // writers — the doubling documented on `setSegments` above.
      this._segments = [...updates.segments!];
      this._renderSegments();
    }
    if ('timestamp' in updates) {
      this._updateTimestamp(updates.timestamp!);
    }
    if ('status' in updates) {
      const isStreaming = updates.status === 'streaming' || updates.status === 'pending';
      this._updateStreaming(isStreaming);
    }
    if ('attachments' in updates) {
      this._attachments = updates.attachments ?? [];
      this._updateAttachments();
      this._updateWaiting();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private _appendSegmentEl(segment: AparteSegment): void {
    if (!this._segmentsEl) {
        console.warn(`[AparteChatBubble] _appendSegmentEl ABORT: _segmentsEl is null`);
        return;
    }
    const renderer = resolveSegmentRenderer(segment.type, this._cfg);
    if (renderer) {
      // Renderers are plain functions with no element to resolve from — expose
      // this bubble's config as the ambient render config for the duration.
      const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
      if (el) {
        this._segmentsEl.appendChild(el);
        runWithConfig(this._cfg, () => renderer.setup?.(el, segment));
      }
    } else {
      this._segmentsEl.appendChild(unrenderedSegment(segment));
    }
    if (this._contentEl) this._contentEl.style.display = 'none';
    this._reflectError();
  }

  private _applySegmentUpdate(segmentId: string, segment: AparteSegment, updates: Partial<AparteSegment>): void {
    const el = this._segmentsEl?.querySelector(`:scope > [data-segment-id="${cssEscape(segmentId)}"]`) as HTMLElement | null;
    if (!el) {
      this._renderSegments();
      return;
    }
    const renderer = resolveSegmentRenderer(segment.type, this._cfg);
    if (!renderer) return;

    if (renderer.update) {
      runWithConfig(this._cfg, () => renderer.update!(el, segment));
    } else {
      const newEl = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
      if (newEl) {
        el.replaceWith(newEl);
        runWithConfig(this._cfg, () => renderer.setup?.(newEl, segment));
      }
    }

    // Handle collapsed state only when explicitly provided in the update —
    // never override a state the user set by clicking <summary>.
    if ('collapsed' in updates) {
      if ((updates as { collapsed?: boolean }).collapsed) {
        el.removeAttribute('open');
      } else {
        el.setAttribute('open', '');
      }
    }
  }

  private _getDisplayName(): string {
    const nameAttr = this.getAttribute('name');
    if (nameAttr) return nameAttr;
    const locale = this._cfg.getLocale();
    return this._role === 'user'
      ? (locale.roleNameUser ?? 'You')
      : (locale.roleNameAssistant ?? 'Assistant');
  }

  private _getAvatarInitial(): string {
    const name = this._getDisplayName();
    return name.length > 0 ? name[0]! : (this._role === 'user' ? 'U' : 'A');
  }

  private _render(): void {
    // The message role comes from `data-role` alone; the host's `role` attribute is
    // ARIA's and is set to a valid value here. "user" and "assistant" are not ARIA
    // roles and would trip accessibility tooling — which is exactly why the message
    // role never belonged on that attribute. The role-based styling lives on inner
    // `data-role` markers, so the swap is transparent to CSS.
    const dataRole = this.getAttribute('data-role');
    const role = (dataRole === 'user' || dataRole === 'assistant') ? dataRole : 'assistant';
    this._role = role as AparteBubbleRole;
    if (this.getAttribute('role') !== 'article') {
        this.setAttribute('role', 'article');
    }
    if (!this.hasAttribute('data-role')) {
        this.setAttribute('data-role', role);
    }

    // Ensure we don't overwrite if already rendered (re-entrancy check)
    if (this.querySelector('.aparte-message')) return;

    const displayName = this._getDisplayName();
    const initial = this._getAvatarInitial();

    // Custom structural shell (aparteGlobalConfig.setBubbleShellRenderer). Must root at
    // .aparte-message + carry the region hooks; the queries below are null-guarded
    // so a partial shell degrades gracefully. See AparteBubbleShellRenderer.
    const shell = this._cfg.getBubbleShellRenderer?.();
    if (shell) {
      const out = runWithConfig(this._cfg, () => shell({ role: this._role, name: displayName, avatarInitial: initial }));
      if (out instanceof HTMLElement) this.replaceChildren(out);
      else this.innerHTML = out;
    } else {
    this.innerHTML = `
      <div class="aparte-message" data-role="${escapeAttr(role)}" role="article" aria-label="${escapeAttr(this._getAriaLabel())}">
        <div class="aparte-avatar" data-role="${escapeAttr(role)}"></div>
        <div class="aparte-body">
          <div class="aparte-header">
            <span class="aparte-name">${escapeHtml(displayName)}</span>
            <span class="aparte-timestamp"></span>
          </div>
          <div class="aparte-attachments" hidden></div>
          <div class="aparte-message-content">
            <div class="aparte-segments"></div>
            <div class="aparte-content"></div>
            <div class="aparte-waiting" hidden>
              <span class="aparte-dots" aria-hidden="true"><span class="aparte-dot"></span><span class="aparte-dot"></span><span class="aparte-dot"></span></span>
              <span class="aparte-sr-only"></span>
            </div>
          </div>
          <div class="aparte-footer">
            <div class="aparte-branch-picker" hidden>
              <button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-branch-prev" aria-label="${escapeAttr(this._cfg.getLocale().previousResponse ?? 'Previous response')}">&#8249;</button>
              <span class="aparte-branch-label">1 / 1</span>
              <!-- The move has to be ANNOUNCED. Pressing the arrows deliberately does not
                   take focus, so without a live region a screen-reader user gets the new
                   branch and no indication anything changed. The visible label cannot be
                   the region itself: a custom sibling-nav renderer may replace it with
                   dots, which reads as nothing. No new locale key — the position is
                   digits, and the buttons beside it already carry translated labels. -->
              <span class="aparte-sr-only aparte-branch-status" aria-live="polite"></span>
              <button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-branch-next" aria-label="${escapeAttr(this._cfg.getLocale().nextResponse ?? 'Next response')}">&#8250;</button>
            </div>
            <div class="aparte-action-bar" role="toolbar" aria-label="${escapeAttr(this._cfg.getLocale().messageActions ?? 'Message actions')}"></div>
          </div>
        </div>
      </div>
    `;
    }

    this._contentEl = this.querySelector('.aparte-content');
    this._segmentsEl = this.querySelector('.aparte-segments');
    this._attachmentsEl = this.querySelector('.aparte-attachments');
    this._actionBarEl = this.querySelector('.aparte-action-bar');
    // ONE listener on the bar, not one per button: every build path rewrites the bar's
    // innerHTML, so a per-button listener would have to be re-attached three times and
    // would be lost the first time somebody added a fourth path. The bar element itself
    // outlives every rewrite.
    this._actionBarEl?.addEventListener('keydown', this._onActionBarKeydown);
    this._branchPickerEl = this.querySelector('.aparte-branch-picker');
    this._footerEl = this.querySelector('.aparte-footer');

    // A bubble mounted while a reply already streams (a framework rendering the list
    // after the viewport flagged itself) starts in the busy state it would have been
    // pushed into.
    this._transcriptBusy = !!this.closest('aparte-chat-viewport')?.hasAttribute('data-busy');

    this._updateActionBar();
    this._renderAvatar();
    // Re-apply the streaming state onto the freshly-built `.aparte-message`.
    // Framework wrappers create the element with its attributes already set, so
    // `streaming` arrives BEFORE this render and `_updateStreaming()` had nothing
    // to write to — leaving a pending assistant bubble without `aria-busy` and
    // with its action bar exposed (copy/retry on an empty, still-streaming reply).
    if (this._streaming) this._updateStreaming(true);
    this._updateWaiting();
  }

  /**
   * Show the built-in waiting indicator while this bubble is in flight and has
   * nothing to show yet — the gap between "user sends" and the first token, which
   * used to be a bubble with a name and an empty body.
   *
   * The dots are CSS (no per-token work, themable, honours reduced-motion); the
   * accessible name is `locale.typing`, next to the `aria-busy` the streaming state
   * already sets. A custom bubble shell without the region simply has no indicator
   * (same null-guarded degradation as the other region hooks).
   */
  private _updateWaiting(): void {
    const empty = this._segments.length === 0 && !this._content.trim();
    const waiting = this._streaming && this._role !== 'user' && empty;

    // The painted box is hidden when it has nothing to paint. It carries the user
    // bubble's background, padding and radius, so an empty one is a coloured
    // rectangle with nothing in it — which is exactly what a message that is ONLY
    // attachments produced: the chips render ABOVE this box, so the box had no
    // content, no segments and no dots, and still drew itself.
    //
    // `hidden` and not `style.display`, deliberately: nothing sets an explicit
    // `display` on this class, so the UA sheet's rule applies. Where a component
    // DOES set one, `[hidden]` loses — a trap this repo has already paid for.
    const box = this.querySelector('.aparte-message-content') as HTMLElement | null;
    if (box) box.hidden = empty && !waiting;

    // Nothing to show and nothing coming: no chrome either. A turn whose only content
    // is a tool that renders nothing (an `ask_user` with no preamble), or one stopped
    // before its first token, used to leave a name and a timestamp floating over
    // nothing — an orphan header in the transcript. The stylesheet hides the whole
    // row on `data-empty`; attachments count as content, and a streaming bubble is
    // never empty (it shows the waiting dots).
    const message = this.querySelector('.aparte-message') as HTMLElement | null;
    if (message) {
      message.toggleAttribute('data-empty', empty && !this._streaming && this._attachments.length === 0);
    }

    const el = this.querySelector('.aparte-waiting') as HTMLElement | null;
    if (!el) return;
    el.hidden = !waiting;
    if (!waiting) return;
    const label = this._cfg.getLocale().typing;
    const sr = el.querySelector('.aparte-sr-only');
    if (sr && sr.textContent !== label) sr.textContent = label;
  }

  /**
   * Hand the avatar host element off to the registered AvatarProvider, if any.
   *
   * With no provider the slot is left exactly as the shell rendered it — which for
   * the default shell means EMPTY, and hidden by `.aparte-avatar:empty`. This used
   * to claim it "falls back to the default initial rendered by `_render()`"; there
   * is no such initial, and believing there was is what made `_updateRole` write
   * one.
   */
  private _renderAvatar(): void {
    const avatar = this.querySelector('.aparte-avatar') as HTMLElement | null;
    if (!avatar) return;

    // Tear down any previously-mounted live component before re-rendering.
    if (this._avatarCleanup) {
      try { this._avatarCleanup(); } catch { /* ignore */ }
      this._avatarCleanup = null;
    }

    const provider = this._cfg.getAvatarProvider();
    if (!provider) return; // leave the slot as the shell rendered it

    avatar.textContent = '';
    const cleanup = provider.render(this._role, avatar);
    if (typeof cleanup === 'function') this._avatarCleanup = cleanup;
  }

  private _updateRole(): void {
    const message = this.querySelector('.aparte-message');
    const avatar = this.querySelector('.aparte-avatar');
    const nameEl = this.querySelector('.aparte-name');

    if (message) {
      message.setAttribute('data-role', this._role);
      message.setAttribute('aria-label', this._getAriaLabel());
    }
    if (avatar) {
      avatar.setAttribute('data-role', this._role);
      // Refresh an initial that is ALREADY there; never create one — the default
      // shell renders this slot empty and the stylesheet hides it while it stays
      // empty. Same rule as `_updateName`, which is where it was actually costing
      // something; the reasoning is written out there.
      if (avatar.textContent) avatar.textContent = this._getAvatarInitial();
    }
    if (nameEl) {
      nameEl.textContent = this._getDisplayName();
    }
    // Re-render the action bar so buttons match the correct role
    // (critical when the role attribute is set after connectedCallback)
    this._updateActionBar();
    this._renderAvatar();
  }

  private _updateName(): void {
    const avatar = this.querySelector('.aparte-avatar') as HTMLElement | null;
    const nameEl = this.querySelector('.aparte-name');
    /*
     * Two conditions, and the second one is the fix.
     *
     * No provider: otherwise a name change would wipe a live avatar component.
     *
     * Already non-empty: the default shell renders this slot EMPTY and the
     * stylesheet hides it while it stays empty — `.aparte-avatar:empty { display:
     * none }`, with the comment "No message avatar by default — the slot only shows
     * once an AvatarProvider (or a consumer) fills it". Writing the initial
     * unconditionally contradicted that, and `_onConfigChange` calls this method, so
     * ANY notifying config change filled the slot: `setLocale` (a language switcher
     * is enough), `setBubbleActions`, `setIconProvider`. Avatars appeared across the
     * transcript on a click that had nothing to do with them, and undoing the click
     * did not remove them, because the text was already written.
     *
     * The guard is "already non-empty" rather than "no provider" on purpose:
     * `avatarInitial` is part of the shell contract, so a CUSTOM shell may render an
     * initial and must still see it refreshed. Empty stays empty; filled stays in
     * sync.
     */
    if (avatar && avatar.textContent && !this._cfg.getAvatarProvider()) {
      avatar.textContent = this._getAvatarInitial();
    }
    if (nameEl) nameEl.textContent = this._getDisplayName();
  }

  private _updateContent(): void {
    if (!this._contentEl) return;

    // If we have segments, don't render simple content
    if (this._segments.length > 0) {
      this._contentEl.style.display = 'none';
      this._updateWaiting();
      return;
    }

    this._contentEl.style.display = '';
    /*
     * The SAME incremental seam the text and thinking segment renderers use.
     *
     * This line used to be `innerHTML = renderMarkdown(this._content)` — the whole message
     * re-parsed, re-sanitised and re-inserted on every token. That is the hot path of the
     * first thing getting-started teaches (`appendMessage` / `appendToken` /
     * `completeMessage`), and it made a published promise false: `setStreamingMarkdownProvider`
     * says "the chat bubble uses it to render the assistant message token-by-token
     * instead of re-parsing the whole string on every token", and the plugin's own page
     * repeats it. Only the segment path honoured it. Found by a cold audit.
     *
     * With no streaming provider registered, `writeStreamedMarkdown` falls through to the
     * one-shot render — so a consumer who has not installed the plugin sees exactly what
     * they saw before.
     *
     * `runWithConfig`, because the seam reads its provider from the ambient config and this
     * bubble may be one of several with configs of their own.
     */
    runWithConfig(this._cfg, () =>
      writeStreamedMarkdown(this as AparteMarkdownStreamHost, this._contentEl!, this._content, this._streaming),
    );
    // The first token retires the waiting indicator (and a cleared content brings
    // it back, e.g. a retry that resets the bubble before re-streaming).
    this._updateWaiting();
    // The Markdown provider only emits plain <pre><code>; apply the registered
    // syntax highlighter (if any) to those blocks. Skipped while streaming —
    // re-run once on completion (see _updateStreaming) to avoid per-token churn.
    if (!this._streaming) this._highlightContentCode();
  }

  /**
   * Apply the registered syntax-highlight provider to the code blocks produced
   * by the Markdown provider in the simple-content path. Provider-agnostic: a
   * full-block provider (e.g. Shiki) returns `<pre>…</pre>` so we replace the
   * element; a token provider (e.g. Prism, highlight.js) returns inner HTML so
   * we fill the existing `<code>`. No-op when no highlighter is installed.
   */
  private _highlightContentCode(): void {
    if (!this._contentEl || !this._cfg.hasHighlightProvider()) return;
    this._contentEl.querySelectorAll('pre > code').forEach((codeEl) => {
      const code = codeEl.textContent ?? '';
      if (!code.trim()) return;
      const match = codeEl.className.match(/language-([\w+#-]+)/i);
      const lang = match?.[1] ?? '';
      const pre = codeEl.parentElement;
      Promise.resolve(this._cfg.highlightCode(code, lang)).then((html) => {
        const out = (html ?? '').trim();
        if (!out || !pre || !pre.isConnected) return;
        if (/^<pre[\s>]/i.test(out)) {
          pre.outerHTML = out;                       // full block (Shiki)
        } else {
          (codeEl as HTMLElement).innerHTML = out;   // inner tokens (Prism, hljs)
        }
      }).catch(() => { /* keep the plain block on failure */ });
    });
  }

  private _renderSegments(): void {
    if (!this._segmentsEl) return;

    // Clear existing segments
    this._segmentsEl.innerHTML = '';

    for (const segment of this._segments) {
      const renderer = resolveSegmentRenderer(segment.type, this._cfg);
      if (renderer) {
        const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
        if (el) {
          this._segmentsEl.appendChild(el);
          runWithConfig(this._cfg, () => renderer.setup?.(el, segment));
        }
      } else {
        this._segmentsEl.appendChild(unrenderedSegment(segment));
      }
    }

    // Hide simple content when segments are present
    if (this._contentEl) {
      this._contentEl.style.display = this._segments.length > 0 ? 'none' : '';
    }
    this._reflectError();
  }

  /**
   * Reflect the error state on the bubble: `data-error` on `.aparte-message` while
   * an error segment is present. Derived from segments (not the message `status`
   * attribute) so it works identically in vanilla and in every wrapper — the
   * error segment flows through the reactive list in all of them. CSS themes
   * `.aparte-message[data-error]`; custom error content is via setErrorRenderer.
   */
  private _reflectError(): void {
    const message = this.querySelector('.aparte-message');
    if (!message) return;
    const hasError = this._segments.some(s => s.type === 'error');
    if (hasError) message.setAttribute('data-error', '');
    else message.removeAttribute('data-error');
  }

  private _updateTimestamp(value: string | number | null): void {
    const timestampEl = this.querySelector('.aparte-timestamp');
    if (!timestampEl || !value) return;

    try {
      const date = new Date(isNaN(Number(value)) ? value : Number(value));
      // The locale's own tag, not `undefined`. `undefined` means "follow the
      // BROWSER", which is why a French chat on an en-US browser still read
      // `7:32 PM` — the app had chosen a language and the clock had not heard.
      // Still `undefined` when no tag is declared: that is the documented default
      // and the behaviour every consumer has today.
      timestampEl.textContent = date.toLocaleTimeString(this._cfg.getLocale().tag || undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      timestampEl.textContent = '';
    }
  }

  private _getAriaLabel(): string {
    const locale = this._cfg.getLocale();
    return this._role === 'user'
      ? (locale.yourMessage ?? 'Your message')
      : (locale.assistantResponse ?? 'Assistant response');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Attachments
  // ─────────────────────────────────────────────────────────────────────────

  private _updateAttachments(): void {
    if (!this._attachmentsEl) return;

    if (this._role !== 'user' || this._attachments.length === 0) {
      this._attachmentsEl.hidden = true;
      this._attachmentsEl.innerHTML = '';
      return;
    }

    this._attachmentsEl.hidden = false;

    // Custom attachment chips (aparteGlobalConfig.setAttachmentRenderer) — one node per
    // attachment; the consumer owns markup + interactions (no default preview wiring).
    const customAttachment = this._cfg.getAttachmentRenderer?.();
    if (customAttachment) {
      this._attachmentsEl.replaceChildren();
      for (const a of this._attachments) {
        const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => customAttachment(a)));
        if (el) this._attachmentsEl.appendChild(el);
      }
      return;
    }

    this._attachmentsEl.innerHTML = this._attachments.map(a => {
      const name = escapeHtml(a.name);
      if (a.type.startsWith('image/')) {
        // `aparte-thumbnail` is the RECIPE (the box, the size, the ground); `aparte-thumb`
        // only maps the strip's measurements onto it. The bubble emitted the mapping
        // without the recipe, so its tiles had no box — a bare "PDF" beside a bare image.
        return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--image" title="${name}">`
          + `<img class="aparte-thumb__img" src="${escapeHtml(a.url)}" alt="${name}" loading="lazy" />`
          + `<span class="aparte-thumb__name">${name}</span></div>`;
      }
      return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--file" title="${name}">`
        + `<span class="aparte-thumb__ext">${escapeHtml(this._fileExt(a.name))}</span>`
        + `<span class="aparte-thumb__name">${name}</span></div>`;
    }).join('');

    // Image tiles ask for a full-size preview — but the lightbox is the app's, so
    // the tile only becomes a button once the app declared it opens one. Otherwise
    // it stays a plain picture: no role, no tab stop, no pointer (see the CSS,
    // which keys the cursor off role="button").
    if (!this._cfg.getHostHandlers().attachmentPreview) return;
    this._attachmentsEl.querySelectorAll('.aparte-thumb--image').forEach(tile => {
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      const open = (): void => {
        const img = tile.querySelector('.aparte-thumb__img') as HTMLImageElement | null;
        if (!img) return;
        this.dispatchEvent(new CustomEvent('aparte-attachment-preview', {
          bubbles: true, composed: true,
          detail: { url: img.src, name: tile.getAttribute('title') ?? '' },
        }));
      };
      tile.addEventListener('click', open);
      tile.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== 'Enter' && key !== ' ') return;
        e.preventDefault();
        open();
      });
    });
  }

  /** Uppercased file extension (≤4 chars), or 'FILE' when there is none. */
  private _fileExt(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(dot + 1).toUpperCase().slice(0, 4) : 'FILE';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Branch Picker
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The branch arrows are handled by DELEGATION, on this element, bound once.
   *
   * They used to get a fresh listener each, attached by `_render()` to the buttons
   * `_render()` had just created. So a click that landed while a re-render was
   * swapping those nodes hit an element about to be discarded, and did nothing at
   * all — not late, nothing. Invisible on a fast machine; reproducible on
   * WebKit-Linux in CI, where `‹` left the picker on "2 / 2" and a 20-second
   * assertion watched it stay there.
   *
   * Delegation makes `_render()` irrelevant to it: the listener lives on the host,
   * which is never replaced, and `closest()` finds whichever button exists at the
   * moment of the click. It is also less work — one listener per bubble instead of
   * two per bubble per render.
   *
   * Bound in `connectedCallback` and removed in `disconnectedCallback` as a stable
   * field, because an inline arrow re-added on every re-connect is how this repo has
   * stacked listeners twice before (the viewport, and `aparte-select`).
   */
  private _onBranchPickerClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('.aparte-branch-prev, .aparte-branch-next');
    if (!button || !this.contains(button)) return;
    const direction = button.classList.contains('aparte-branch-prev') ? 'prev' : 'next';
    const messageId = this.getAttribute('message-id');
    if (!messageId) return;
    const detail: AparteBranchNavigateEventDetail = { messageId, direction };
    // Tree-based navigation: let the viewport handle the branch switch
    this.dispatchEvent(new CustomEvent<AparteBranchNavigateEventDetail>('aparte-branch-navigate', {
      bubbles: true,
      composed: true,
      detail,
    }));
  };

  /**
   * A link the MODEL wrote is about to be followed. Announced as a cancelable event
   * before the browser acts, so a host can route it — an external browser, a
   * confirmation, an embedded view — without intercepting the DOM (issue #38). With
   * no listener the browser follows it, which the sanitizer has already made open in
   * a new tab for an external URL; `preventDefault()` on the event cancels the click.
   *
   * Only anchors inside the message body: the action bar and the branch picker are
   * buttons, and an attachment tile is its own event.
   */
  private _onLinkClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || !this.contains(anchor)) return;
    const detail: AparteLinkClickEventDetail = {
      href: anchor.getAttribute('href') ?? '',
      anchor,
      messageId: this.getAttribute('message-id'),
    };
    const announced = this.dispatchEvent(new CustomEvent<AparteLinkClickEventDetail>('aparte-link-click', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail,
    }));
    if (!announced) event.preventDefault();
  };

  /**
   * Whether a reply is streaming somewhere in this bubble's transcript. Set by the
   * viewport (`data-busy` on it, pushed here), read once on connect for a bubble
   * mounted while the flag was already up. While busy, the branch arrows and the
   * retry/edit actions are disabled — the transcript is read-only except for Stop.
   */
  private _transcriptBusy = false;

  setTranscriptBusy(busy: boolean): void {
    if (this._transcriptBusy === busy) return;
    this._transcriptBusy = busy;
    this._applyTranscriptBusy();
    this._updateBranchPicker();
  }

  private _applyTranscriptBusy(): void {
    if (!this._actionBarEl) return;
    for (const btn of this._actionBarEl.querySelectorAll<HTMLButtonElement>('[data-action="retry"], [data-action="edit"]')) {
      btn.disabled = this._transcriptBusy;
    }
  }

  private _updateBranchPicker(): void {
    if (!this._branchPickerEl) return;
    if (this._siblingCount <= 1 || this._role !== 'assistant') {
      this._branchPickerEl.hidden = true;
      this._syncFooterVisibility();
      return;
    }
    this._branchPickerEl.hidden = false;
    this._syncFooterVisibility();
    const label = this._branchPickerEl.querySelector('.aparte-branch-label');
    if (label) {
      // Custom position indicator (aparteGlobalConfig.setSiblingNavRenderer) — e.g. dots —
      // fills the label between the arrows; the arrows keep their behavior.
      const customNav = this._cfg.getSiblingNavRenderer?.();
      if (customNav) {
        const out = runWithConfig(this._cfg, () => customNav({ count: this._siblingCount, index: this._siblingIndex }));
        if (out instanceof HTMLElement) label.replaceChildren(out);
        else label.innerHTML = out;
      } else {
        label.textContent = `${this._siblingIndex + 1} / ${this._siblingCount}`;
      }
    }

    const status = this._branchPickerEl.querySelector('.aparte-branch-status');
    if (status) {
      const position = `${this._siblingIndex + 1} / ${this._siblingCount}`;
      if (status.textContent !== position) status.textContent = position;
    }

    const prevBtn = this._branchPickerEl.querySelector('.aparte-branch-prev') as HTMLButtonElement | null;
    const nextBtn = this._branchPickerEl.querySelector('.aparte-branch-next') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = this._transcriptBusy || this._siblingIndex === 0;
    if (nextBtn) nextBtn.disabled = this._transcriptBusy || this._siblingIndex === this._siblingCount - 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Action Bar
  // ─────────────────────────────────────────────────────────────────────────

  private _updateActionBar(): void {
    if (!this._actionBarEl) return;
    // While the inline editor is open the bar shows save (✓) / cancel (✗).
    if (this._editing) {
      this._renderEditActions();
      return;
    }
    const config = this._cfg.getBubbleActions();
    const icons = this._cfg.getIconProvider();
    const locale = this._cfg.getLocale();
    const buttons: string[] = [];

    if (this._role === 'user') {
      if (config.user) {
        // Explicit ordered set replaces the flag defaults for user bubbles.
        for (const a of config.user) buttons.push(this._actionButtonHtml(a, icons, locale));
      } else {
        // Flag-driven set. Only `copy` is on by default — see
        // APARTE_DEFAULT_BUBBLE_ACTIONS: edit needs a host to keep the new text.
        if (config.copy) buttons.push(this._actionButtonHtml('copy', icons, locale));
        if (config.edit) buttons.push(this._actionButtonHtml('edit', icons, locale));
      }
    } else if (this._role === 'assistant') {
      if (config.assistant) {
        // Explicit ordered set replaces the flag defaults (incl. the info button).
        for (const a of config.assistant) buttons.push(this._actionButtonHtml(a, icons, locale));
      } else {
        // Flag-driven set. Only `copy` is on by default — retry, feedback and
        // info all need a host or a listener to mean anything.
        if (config.copy) buttons.push(this._actionButtonHtml('copy', icons, locale));
        if (config.retry) buttons.push(this._actionButtonHtml('retry', icons, locale));
        if (config.feedback) {
          buttons.push(this._actionButtonHtml('thumbUp', icons, locale));
          buttons.push(this._actionButtonHtml('thumbDown', icons, locale));
        }
        if (config.info) buttons.push(this._actionButtonHtml('info', icons, locale));
      }
    }

    this._actionBarEl.innerHTML = buttons.join('');

    // Custom actions registered via aparteGlobalConfig.registerAction — appended
    // after the built-ins, built as DOM (label goes to attributes, never
    // interpolated into innerHTML) so a consumer label can't inject markup.
    this._appendCustomActions(icons);
    this._applyTranscriptBusy();

    // Wire up button handlers — messageId read dynamically at click time
    // so it's always correct even when Angular sets the attribute after connectedCallback
    this._actionBarEl.querySelectorAll('.aparte-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleActionClick(e as MouseEvent));
    });

    this._syncFooterVisibility();
  }

  /**
   * `role="toolbar"` promises a keyboard model. This is it.
   *
   * The bar has announced itself as a toolbar since it existed, and a toolbar is ONE
   * tab stop whose members are reached with the arrow keys — that is the whole of what
   * the role means to a screen-reader user. What shipped was five independent tab
   * stops per message, so the role described a behaviour that did not exist: a reader
   * told to press Right heard nothing move, and tabbing through a long transcript
   * walked every button of every message.
   *
   * The roving index is re-applied from `_syncFooterVisibility`, which is the single
   * funnel all three build paths already run through (the flag-driven bar, the edit
   * bar, and the branch picker's own visibility pass). Re-deriving it there rather
   * than in each builder is what keeps the invariant true after a `setBubbleActions`
   * rebuild — the drift this pattern usually dies of.
   *
   * DISABLED buttons are skipped, not merely un-tabbable: while the transcript is busy
   * retry and edit are disabled, and a toolbar whose arrows stop on a dead control
   * reads as broken. If every button is disabled the bar keeps one tab stop anyway, so
   * focus sitting there when the turn ends is not thrown to the top of the page.
   */
  private _rovingButtons(): HTMLButtonElement[] {
    if (!this._actionBarEl) return [];
    return [...this._actionBarEl.querySelectorAll<HTMLButtonElement>('button')];
  }

  private _setRovingIndex(): void {
    const buttons = this._rovingButtons();
    if (!buttons.length) return;
    const usable = buttons.filter((b) => !b.disabled);
    const current = buttons.find((b) => b.tabIndex === 0 && !b.disabled);
    const stop = current ?? usable[0] ?? buttons[0];
    for (const button of buttons) button.tabIndex = button === stop ? 0 : -1;
  }

  /**
   * Left/Right walk the bar, Home/End jump to its ends, and both wrap.
   *
   * Arrow keys follow the READING direction, per the ARIA practices: in an RTL
   * transcript Left is "next". `dir` is resolved from the nearest ancestor that sets
   * it — the viewport writes it from `locale.direction` — because a bubble has none of
   * its own and `getComputedStyle` is not something jsdom can answer.
   */
  private _onActionBarKeydown = (e: Event): void => {
    const event = e as KeyboardEvent;
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = this._rovingButtons().filter((b) => !b.disabled);
    if (buttons.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const from = buttons.findIndex((b) => b === active);
    if (from === -1 && event.key !== 'Home' && event.key !== 'End') return;
    const rtl = (this.closest('[dir]')?.getAttribute('dir') ?? document.documentElement.dir) === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === forward) next = (from + 1) % buttons.length;
    else next = (from - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    for (const button of this._rovingButtons()) button.tabIndex = button === buttons[next] ? 0 : -1;
    buttons[next]?.focus();
  };

  /**
   * An empty action bar is not a bar: with every action off it was still a
   * `role="toolbar"` with nothing in it (announced as such), and it still reserved
   * its fixed height plus the footer's under every bubble. So both follow their
   * contents — the footer stays as long as the branch picker or the bar has
   * something to show.
   */
  private _syncFooterVisibility(): void {
    if (this._actionBarEl) this._actionBarEl.hidden = this._actionBarEl.children.length === 0;
    this._setRovingIndex();
    if (!this._footerEl) return;
    const barEmpty = !this._actionBarEl || this._actionBarEl.hidden;
    const pickerHidden = !this._branchPickerEl || this._branchPickerEl.hidden;
    this._footerEl.hidden = barEmpty && pickerHidden;
    // The stylesheet floats an older message's footer out of the flow so that it
    // reserves no row — except while the branch picker shows, which has to stay in
    // the flow and in view. The picker's visibility is decided here, so the flag that
    // CSS reads is written here too.
    this.querySelector('.aparte-message')?.toggleAttribute('data-branches', !pickerHidden);
  }

  /** Append the registered custom action buttons for this bubble's role. */
  private _appendCustomActions(icons: ReturnType<AparteConfig['getIconProvider']>): void {
    if (!this._actionBarEl) return;
    for (const a of this._cfg.getActions('bubble')) {
      const roles = a.bubble?.roles ?? ['user', 'assistant'];
      if (!roles.includes(this._role)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aparte-btn aparte-btn--icon aparte-action-btn aparte-action-custom';
      btn.dataset['action'] = `custom:${a.id}`;
      // aria-label/title via setAttribute — safe for consumer-provided strings.
      btn.setAttribute('aria-label', a.label);
      btn.setAttribute('title', a.label);
      // Icon: raw inline SVG/HTML, else an icon-provider key (trusted output).
      const fromProvider = (icons as unknown as Record<string, (() => string) | undefined>)[a.icon];
      btn.innerHTML = a.icon.startsWith('<')
        ? a.icon
        : (typeof fromProvider === 'function' ? fromProvider() : (a.iconFallback ?? ''));
      this._actionBarEl.appendChild(btn);
    }
  }

  /** Build the `<button>` HTML for a single named action (shared by flag + per-role rendering). */
  private _actionButtonHtml(
    action: string,
    icons: ReturnType<AparteConfig['getIconProvider']>,
    locale: ReturnType<AparteConfig['getLocale']>,
  ): string {
    switch (action) {
      case 'copy': {
        const l = locale.copy ?? 'Copy';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-copy" data-action="copy" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.copy()}</button>`;
      }
      case 'edit': {
        const l = locale.edit ?? 'Edit message';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-edit" data-action="edit" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.edit()}</button>`;
      }
      case 'retry': {
        const l = locale.retry ?? 'Retry';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-retry" data-action="retry" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.retry()}</button>`;
      }
      case 'thumbUp': {
        const l = locale.feedbackPositive ?? 'Good response';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-feedback-pos" data-action="feedback-positive" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbUp()}</button>`;
      }
      case 'thumbDown': {
        const l = locale.feedbackNegative ?? 'Bad response';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-feedback-neg" data-action="feedback-negative" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbDown()}</button>`;
      }
      case 'info': {
        // Only when there are numbers to show: a details button over nothing is a
        // dead button. The popover itself is the app's (see `aparte-message-info`).
        if (!this._usage) return '';
        const l = locale.messageInfo ?? 'Details';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-action-btn aparte-action-info" data-action="info" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${this._cfg.getIcon('info')}</button>`;
      }
      default:
        return '';
    }
  }

  /** Render the edit-mode action bar: ✓ save (green) + ✗ cancel (red). */
  private _renderEditActions(): void {
    if (!this._actionBarEl) return;
    const locale = this._cfg.getLocale();
    const saveLabel = locale.editConfirm ?? 'Save';
    const cancelLabel = locale.editCancel ?? 'Cancel';
    this._actionBarEl.innerHTML =
      `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-btn--success aparte-action-btn aparte-action-edit-save" data-action="edit-save" ` +
      `aria-label="${escapeAttr(saveLabel)}" title="${escapeAttr(saveLabel)}">${this._cfg.getIcon('check')}</button>` +
      `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-btn--danger aparte-action-btn aparte-action-edit-cancel" data-action="edit-cancel" ` +
      `aria-label="${escapeAttr(cancelLabel)}" title="${escapeAttr(cancelLabel)}">${this._cfg.getIcon('close')}</button>`;
    this._actionBarEl.querySelectorAll('.aparte-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleActionClick(e as MouseEvent));
    });
    // Save/cancel must show even when every action flag is off.
    this._syncFooterVisibility();
  }

  private _handleActionClick(e: MouseEvent): void {
    const btn = (e.currentTarget as HTMLElement);
    const action = btn.dataset['action'];
    // Read dynamically — attribute may not be set yet at render time
    const messageId = this.getAttribute('message-id');

    // Custom actions (aparteGlobalConfig.registerAction) emit a generic aparte-action
    // event carrying the action id — same DOM-event contract as retry/feedback.
    if (action?.startsWith('custom:') && messageId) {
      const actionId = action.slice('custom:'.length);
      const detail: AparteActionEventDetail = {
        actionId,
        zone: 'bubble',
        messageId,
        role: this._role,
        targetId: this._resolveTargetId(),
      };
      this.dispatchEvent(new CustomEvent<AparteActionEventDetail>('aparte-action', {
        bubbles: true, composed: true, detail,
      }));
      this._cfg.getActions('bubble').find(x => x.id === actionId)?.onClick?.(e);
      return;
    }

    switch (action) {
      case 'copy': {
        // The reply, not the reasoning: a `thinking` segment is the model's scratchpad,
        // and the client already keeps it out of the history it sends back
        // (`_segmentsToText`) for the same reason. Copying it along with the answer
        // pasted a paragraph of deliberation above every reply — no assistant on the
        // market does that.
        const text = this._content || this._segments
          .filter(s => s.type !== 'thinking')
          .map(s => (s as { content?: string }).content ?? '')
          .join('\n');
        const icons = this._cfg.getIconProvider();
        const locale = this._cfg.getLocale();
        copyText(text).then(() => {
          btn.innerHTML = icons.check();
          btn.setAttribute('data-copied', '');
          const copiedLabel = locale.copied ?? locale.copy ?? 'Copied';
          btn.setAttribute('title', copiedLabel);
          btn.setAttribute('aria-label', copiedLabel);
          setTimeout(() => {
            btn.removeAttribute('data-copied');
            btn.innerHTML = icons.copy();
            const copyLabel = locale.copy ?? 'Copy';
            btn.setAttribute('title', copyLabel);
            btn.setAttribute('aria-label', copyLabel);
          }, 2000);
        }).catch(() => {
          console.warn('[aparte] Clipboard write failed');
        });
        break;
      }
      case 'retry': {
        if (!messageId) break;
        const targetId = this._resolveTargetId();
        const detail: AparteRetryEventDetail = { messageId, targetId };
        this.dispatchEvent(new CustomEvent<AparteRetryEventDetail>('aparte-retry', {
          bubbles: true, composed: true,
          detail,
        }));
        break;
      }
      case 'edit': {
        this._enterEditMode();
        break;
      }
      case 'edit-save': {
        this._exitEditMode(true);
        break;
      }
      case 'edit-cancel': {
        this._exitEditMode(false);
        break;
      }
      case 'feedback-positive':
      case 'feedback-negative': {
        if (!messageId) break;
        const value: AparteFeedbackEventDetail['value'] = action === 'feedback-positive' ? 'positive' : 'negative';
        btn.setAttribute('data-submitted', '');
        const detail: AparteFeedbackEventDetail = { messageId, value };
        this.dispatchEvent(new CustomEvent<AparteFeedbackEventDetail>('aparte-feedback', {
          bubbles: true, composed: true,
          detail,
        }));
        break;
      }
      case 'info': {
        if (!messageId) break;
        const detail: AparteMessageInfoEventDetail = {
          messageId,
          usage: this._usage ?? undefined,
        };
        this.dispatchEvent(new CustomEvent<AparteMessageInfoEventDetail>('aparte-message-info', {
          bubbles: true, composed: true,
          detail,
        }));
        break;
      }
    }
  }

  /**
   * Open the inline editor for a user message. Idempotent — a second `edit`
   * click while already editing is a no-op (no stacked editors).
   *
   * The editor reuses the composer's contenteditable primitive
   * (`<aparte-composer-input>`) so editing is iso with composing: same autosize,
   * IME, paste and styling. With no `<aparte-composer>` root it runs standalone —
   * `Enter` (Shift+Enter = newline) surfaces as `aparte-composer-submit`, which we
   * treat as save; `Esc` cancels.
   */
  private _enterEditMode(): void {
    if (this._editing || !this._contentEl) return;
    this._editing = true;
    this.querySelector('.aparte-message')?.setAttribute('data-editing', '');

    const input = document.createElement('aparte-composer-input') as AparteComposerInput;
    input.setAttribute('placeholder', this._cfg.getLocale().edit ?? 'Edit message');
    this._editInput = input;

    this._contentEl.style.display = 'none';
    this._contentEl.insertAdjacentElement('afterend', input);
    // `insertAdjacentElement` upgrades + connects synchronously, so the editor is
    // ready — seed it with the current text (autosizes to fit).
    input.setValue(this._content);

    // Enter (via the primitive's standalone submit event) saves; Esc cancels.
    input.addEventListener('aparte-composer-submit', () => this._exitEditMode(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        this._exitEditMode(false);
      }
    });

    // Swap the action bar over to ✓ / ✗.
    this._updateActionBar();

    input.focusEnd();
  }

  /**
   * Leave edit mode. When `save` is true and the text actually changed, emits
   * `aparte-edit`; otherwise restores the original message untouched. Always
   * restores the normal action bar and removes the inline editor.
   */
  private _exitEditMode(save: boolean): void {
    if (!this._editing) return;
    const newContent = this._editInput?.getValue() ?? '';
    const original = this._content;

    this._editInput?.remove();
    this._editInput = null;
    if (this._contentEl) this._contentEl.style.display = '';
    this.querySelector('.aparte-message')?.removeAttribute('data-editing');
    this._editing = false;
    this._updateActionBar();

    if (save && newContent && newContent !== original) {
      const messageId = this.getAttribute('message-id');
      if (messageId) {
        const detail: AparteEditEventDetail = {
          messageId,
          content: newContent,
          targetId: this._resolveTargetId(),
        };
        this.dispatchEvent(new CustomEvent<AparteEditEventDetail>('aparte-edit', {
          bubbles: true, composed: true,
          detail,
        }));
      }
    }
  }

  private _resolveTargetId(): string | undefined {
    // Walk up to the chat host element with an id. Angular's wrapper root IS the
    // `<aparte-chat>` element (its component selector); the plain-root wrappers
    // (React/Vue/Svelte) render a `<div class="aparte-chat-container" data-aparte-chat
    // id="…">` instead — so match `[data-aparte-chat]` too. Without this, retry/edit
    // resolved to `undefined` outside Angular and AparteClient's fallback hit the
    // bare `<aparte-chat-viewport>` (a different message store) → retry regenerated
    // into the void.
    let el: HTMLElement | null = this.parentElement;
    while (el) {
      const tag = el.tagName?.toLowerCase();
      const isHost = tag === 'aparte-chat' || el.hasAttribute?.('data-aparte-chat');
      if (isHost && el.id) return el.id;
      el = el.parentElement;
    }
    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────


  private _updateStreaming(streaming: boolean): void {
    const wasStreaming = this._streaming;
    this._streaming = streaming;
    const message = this.querySelector('.aparte-message');
    if (message) {
      message.setAttribute('data-streaming', String(streaming));
      if (streaming) {
        // Signal "in progress" to assistive tech; clearing it on completion
        // cues screen readers (via the viewport's aria-live region) to read
        // the finished response.
        message.setAttribute('aria-busy', 'true');
        message.classList.add('aparte-message-streaming');
      } else {
        message.removeAttribute('aria-busy');
        message.classList.remove('aparte-message-streaming');
      }
    }
    this._updateWaiting();
    // Streaming just finished: highlight the final content once (skipped during
    // streaming to avoid re-highlighting on every token).
    if (wasStreaming && !streaming) this._highlightContentCode();
  }
}

// Register the custom element
if (!customElements.get('aparte-chat-bubble')) {
  customElements.define('aparte-chat-bubble', AparteChatBubble);
}
