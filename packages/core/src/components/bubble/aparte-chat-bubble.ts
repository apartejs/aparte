import type {
  AparteBubbleRole,
  AparteSegment,
  AparteAttachment,
  AparteBranchNavigateEventDetail,
  AparteRetryEventDetail,
  AparteEditEventDetail,
  AparteFeedbackEventDetail,
  AparteActionEventDetail,
  AparteMessageInfoEventDetail,
  AparteUsage,
  AparteMessage,
} from '../../types/index.js';
import { getSegmentRenderer, installDefaultRenderersOnce } from '../../renderers/index.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { resolveConfig, runWithConfig } from '../../config/config-context.js';
import { cssEscape } from '../../utils/css-escape.js';
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
function segmentRenderResultToElement(result: string | HTMLElement): HTMLElement | null {
    if (result instanceof HTMLElement) return result;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = result;
    return wrapper.firstElementChild as HTMLElement | null;
}

/** Lucide "info" glyph — inline so the action bar needs no icon-provider key. */
const INFO_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/>' +
  '<path d="M12 8h.01"/></svg>';

/**
 * AparteChatBubble - The Render
 * 
 * Message component supporting both simple content and rich segments.
 * Uses Light DOM for global CSS styling.
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
    // Both `data-role` (preferred, set by Angular wrapper) and `role` (legacy
    // / direct usage) feed into the same _role state. The host element gets
    // its own `role="article"` set in _render() for ARIA compliance — that
    // is filtered in attributeChangedCallback so it doesn't loop back as a
    // bubble role of "article".
    return ['role', 'data-role', 'content', 'timestamp', 'message-id', 'streaming', 'name'];
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
  }

  disconnectedCallback(): void {
    window.removeEventListener('aparte-config-change', this._onConfigChange);
    this.removeEventListener('click', this._onBranchPickerClick);
    if (this._avatarCleanup) {
      try { this._avatarCleanup(); } catch { /* ignore */ }
      this._avatarCleanup = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'role':
      case 'data-role':
        // Skip the ARIA-compliance value we set ourselves in _render().
        // Real bubble roles are 'user' or 'assistant'; anything else is
        // either the 'article' we wrote for accessibility or stale.
        if (newValue === 'article') return;
        if (newValue === 'user' || newValue === 'assistant') {
          this._role = newValue as AparteBubbleRole;
          this._updateRole();
        }
        break;
      case 'content':
        this._content = newValue || '';
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
    this._updateContent();
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
      this._segments = updates.segments!;
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
      const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)));
      if (el) {
        this._segmentsEl.appendChild(el);
        runWithConfig(this._cfg, () => renderer.setup?.(el, segment));
      }
    } else {
      warnMissingRenderer(segment.type);
      const fallback = document.createElement('div');
      fallback.className = 'segment segment-unknown';
      fallback.textContent = `[Unknown segment type: ${segment.type}]`;
      this._segmentsEl.appendChild(fallback);
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
      const newEl = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)));
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
    // Read the bubble's logical role from `data-role` (preferred — written
    // by the Angular wrapper) or the legacy `role` attribute, then set the
    // host's actual `role` attribute to a valid ARIA value. "user" and
    // "assistant" are NOT valid ARIA roles and would trigger accessibility
    // warnings in browsers / Lighthouse. The role-based styling lives on
    // inner `data-role` markers, so this swap is transparent to CSS.
    const dataRole = this.getAttribute('data-role');
    const legacyRole = this.getAttribute('role');
    const role = (dataRole && dataRole !== 'article') ? dataRole
        : (legacyRole && legacyRole !== 'article') ? legacyRole
        : 'assistant';
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
              <button class="aparte-branch-prev" aria-label="${escapeAttr(this._cfg.getLocale().previousResponse ?? 'Previous response')}">&#8249;</button>
              <span class="aparte-branch-label">1 / 1</span>
              <button class="aparte-branch-next" aria-label="${escapeAttr(this._cfg.getLocale().nextResponse ?? 'Next response')}">&#8250;</button>
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
    this._branchPickerEl = this.querySelector('.aparte-branch-picker');
    this._footerEl = this.querySelector('.aparte-footer');

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
    this._contentEl.innerHTML = this._cfg.renderMarkdown(this._content);
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
        const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)));
        if (el) {
          this._segmentsEl.appendChild(el);
          runWithConfig(this._cfg, () => renderer.setup?.(el, segment));
        }
      } else {
        // Fallback for unknown segment types
        warnMissingRenderer(segment.type);
        const fallback = document.createElement('div');
        fallback.className = 'segment segment-unknown';
        fallback.textContent = `[Unknown segment type: ${segment.type}]`;
        this._segmentsEl.appendChild(fallback);
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
        return `<div class="aparte-thumb aparte-thumb--image" title="${name}">`
          + `<img class="aparte-thumb__img" src="${escapeHtml(a.url)}" alt="${name}" loading="lazy" />`
          + `<span class="aparte-thumb__name">${name}</span></div>`;
      }
      return `<div class="aparte-thumb aparte-thumb--file" title="${name}">`
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

    const prevBtn = this._branchPickerEl.querySelector('.aparte-branch-prev') as HTMLButtonElement | null;
    const nextBtn = this._branchPickerEl.querySelector('.aparte-branch-next') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = this._siblingIndex === 0;
    if (nextBtn) nextBtn.disabled = this._siblingIndex === this._siblingCount - 1;
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

    // Wire up button handlers — messageId read dynamically at click time
    // so it's always correct even when Angular sets the attribute after connectedCallback
    this._actionBarEl.querySelectorAll('.aparte-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleActionClick(e as MouseEvent));
    });

    this._syncFooterVisibility();
  }

  /**
   * An empty action bar is not a bar: with every action off it was still a
   * `role="toolbar"` with nothing in it (announced as such), and it still reserved
   * its fixed height plus the footer's under every bubble. So both follow their
   * contents — the footer stays as long as the branch picker or the bar has
   * something to show.
   */
  private _syncFooterVisibility(): void {
    if (this._actionBarEl) this._actionBarEl.hidden = this._actionBarEl.children.length === 0;
    if (!this._footerEl) return;
    const barEmpty = !this._actionBarEl || this._actionBarEl.hidden;
    const pickerHidden = !this._branchPickerEl || this._branchPickerEl.hidden;
    this._footerEl.hidden = barEmpty && pickerHidden;
  }

  /** Append the registered custom action buttons for this bubble's role. */
  private _appendCustomActions(icons: ReturnType<AparteConfig['getIconProvider']>): void {
    if (!this._actionBarEl) return;
    for (const a of this._cfg.getActions('bubble')) {
      const roles = a.bubble?.roles ?? ['user', 'assistant'];
      if (!roles.includes(this._role)) continue;
      const btn = document.createElement('button');
      btn.className = 'aparte-action-btn aparte-action-custom';
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
        return `<button class="aparte-action-btn aparte-action-copy" data-action="copy" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.copy()}</button>`;
      }
      case 'edit': {
        const l = locale.edit ?? 'Edit message';
        return `<button class="aparte-action-btn aparte-action-edit" data-action="edit" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.edit()}</button>`;
      }
      case 'retry': {
        const l = locale.retry ?? 'Retry';
        return `<button class="aparte-action-btn aparte-action-retry" data-action="retry" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.retry()}</button>`;
      }
      case 'thumbUp': {
        const l = locale.feedbackPositive ?? 'Good response';
        return `<button class="aparte-action-btn aparte-action-feedback-pos" data-action="feedback-positive" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbUp()}</button>`;
      }
      case 'thumbDown': {
        const l = locale.feedbackNegative ?? 'Bad response';
        return `<button class="aparte-action-btn aparte-action-feedback-neg" data-action="feedback-negative" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbDown()}</button>`;
      }
      case 'info': {
        // Only when there are numbers to show: a details button over nothing is a
        // dead button. The popover itself is the app's (see `aparte-message-info`).
        if (!this._usage) return '';
        const l = locale.messageInfo ?? 'Details';
        return `<button class="aparte-action-btn aparte-action-info" data-action="info" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${INFO_ICON_SVG}</button>`;
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
      `<button class="aparte-action-btn aparte-action-edit-save" data-action="edit-save" ` +
      `aria-label="${escapeAttr(saveLabel)}" title="${escapeAttr(saveLabel)}">${this._cfg.getIcon('check')}</button>` +
      `<button class="aparte-action-btn aparte-action-edit-cancel" data-action="edit-cancel" ` +
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
        const text = this._content || this._segments.map(s => (s as { content?: string }).content ?? '').join('\n');
        const icons = this._cfg.getIconProvider();
        const locale = this._cfg.getLocale();
        navigator.clipboard.writeText(text).then(() => {
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
      const isHost = tag === 'aparte-chat' || tag === 'aparte-chat-component' || el.hasAttribute?.('data-aparte-chat');
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
