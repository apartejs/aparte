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
} from '../../types/index.js';
import { getSegmentRenderer } from '../../renderers/index.js';
import { AparteConfigClass } from '../../config/aparte-config.js';
import { resolveConfig, runWithConfig } from '../../config/config-context.js';
import type { AparteComposerInput } from '../composer/aparte-composer-input.js';

/**
 * Warn ONCE when a segment has no registered renderer — the classic
 * "I forgot registerDefaultRenderers()" trap that otherwise fails silently as a
 * `[Unknown segment type]` box.
 */
let _warnedNoRenderer = false;
function warnMissingRenderer(type: string): void {
    if (_warnedNoRenderer) return;
    _warnedNoRenderer = true;
    console.warn(`[aparte] No renderer for segment "${type}". Did you call registerDefaultRenderers() from @aparte/core?`);
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
 */
export class AparteChatBubble extends HTMLElement {
  private _contentEl: HTMLDivElement | null = null;
  private _segmentsEl: HTMLDivElement | null = null;
  private _attachmentsEl: HTMLDivElement | null = null;
  private _actionBarEl: HTMLDivElement | null = null;
  private _branchPickerEl: HTMLDivElement | null = null;
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
  };

  /**
   * Config governing this bubble: the instance config of the nearest
   * `[data-aparte-host]` boundary, else the global singleton. Resolved live
   * (a single `closest()`) rather than cached — the boundary may be attached
   * AFTER this bubble mounts (AparteChatHost.bind() runs post-mount), so a
   * connect-time cache would freeze the wrong config.
   */
  private get _cfg(): AparteConfigClass {
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
  }

  disconnectedCallback(): void {
    window.removeEventListener('aparte-config-change', this._onConfigChange);
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
    this._segments = segments;
    this._renderSegments();
  }

  /** Add a segment */
  addSegment(segment: AparteSegment): void {
    this._segments.push(segment);
    this._appendSegmentEl(segment);
  }

  /** Update a specific segment */
  updateSegment(segmentId: string, updates: Partial<AparteSegment>): void {
    const index = this._segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      const updated = { ...this._segments[index], ...updates } as AparteSegment;
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
  removeSegment(segmentId: string): void {
    const index = this._segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      this._segments.splice(index, 1);
    }
    const el = this._segmentsEl?.querySelector(`[data-segment-id="${segmentId}"]`);
    el?.remove();
  }

  /** Set attachments (chips shown above message content, user role only) */
  setAttachments(attachments: AparteAttachment[]): void {
    this._attachments = attachments;
    this._updateAttachments();
  }

  /**
   * Set token usage + timing for this message (assistant only).
   * Renders the info ("i") action in the action bar; clicking it opens
   * the app-owned stats popover (`aparte-message-info`).
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
  updateMessage(updates: any): void {
    if ('role' in updates) {
      this._role = updates.role;
      this._updateRole();
    }
    if ('content' in updates) {
      this._content = updates.content;
      this._updateContent();
    }
    if ('segments' in updates) {
      this._segments = updates.segments;
      this._renderSegments();
    }
    if ('timestamp' in updates) {
      this._updateTimestamp(updates.timestamp);
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
    const renderer = getSegmentRenderer(segment.type);
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
    const el = this._segmentsEl?.querySelector(`[data-segment-id="${segmentId}"]`) as HTMLElement | null;
    if (!el) {
      this._renderSegments();
      return;
    }
    const renderer = getSegmentRenderer(segment.type);
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
      if ((updates as any).collapsed) {
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

    // Custom structural shell (AparteConfig.setBubbleShellRenderer). Must root at
    // .aparte-message + carry the region hooks; the queries below are null-guarded
    // so a partial shell degrades gracefully. See AparteBubbleShellRenderer.
    const shell = this._cfg.getBubbleShellRenderer?.();
    if (shell) {
      const out = runWithConfig(this._cfg, () => shell({ role: this._role, name: displayName, avatarInitial: initial }));
      if (out instanceof HTMLElement) this.replaceChildren(out);
      else this.innerHTML = out;
    } else {
    this.innerHTML = `
      <div class="aparte-message" data-role="${role}" role="article" aria-label="${this._getAriaLabel()}">
        <div class="aparte-avatar" data-role="${role}"></div>
        <div class="aparte-body">
          <div class="aparte-header">
            <span class="aparte-name">${displayName}</span>
            <span class="aparte-timestamp"></span>
          </div>
          <div class="aparte-attachments" hidden></div>
          <div class="aparte-message-content">
            <div class="aparte-segments"></div>
            <div class="aparte-content"></div>
          </div>
          <div class="aparte-footer">
            <div class="aparte-branch-picker" hidden>
              <button class="aparte-branch-prev" aria-label="${this._cfg.getLocale().previousResponse ?? 'Previous response'}">&#8249;</button>
              <span class="aparte-branch-label">1 / 1</span>
              <button class="aparte-branch-next" aria-label="${this._cfg.getLocale().nextResponse ?? 'Next response'}">&#8250;</button>
            </div>
            <div class="aparte-action-bar" role="toolbar" aria-label="${this._cfg.getLocale().messageActions ?? 'Message actions'}"></div>
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

    this._setupBranchPickerListeners();
    this._updateActionBar();
    this._renderAvatar();
  }

  /**
   * Hand the avatar host element off to the registered AvatarProvider, if
   * any. Falls back to the default initial / image rendered by `_render()`
   * when no provider is set.
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
    if (!provider) return; // keep the default text initial from _render()

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
      // Default initial — overridden below by the avatar provider if any.
      avatar.textContent = this._getAvatarInitial();
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
    // Only refresh the initial when no provider owns the avatar — otherwise
    // we'd wipe the live component on every name change.
    if (avatar && !this._cfg.getAvatarProvider()) avatar.textContent = this._getAvatarInitial();
    if (nameEl) nameEl.textContent = this._getDisplayName();
  }

  private _updateContent(): void {
    if (!this._contentEl) return;

    // If we have segments, don't render simple content
    if (this._segments.length > 0) {
      this._contentEl.style.display = 'none';
      return;
    }

    this._contentEl.style.display = '';
    this._contentEl.innerHTML = this._cfg.renderMarkdown(this._content);
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
      const renderer = getSegmentRenderer(segment.type);
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

  private _updateTimestamp(value: string | null): void {
    const timestampEl = this.querySelector('.aparte-timestamp');
    if (!timestampEl || !value) return;

    try {
      const date = new Date(isNaN(Number(value)) ? value : Number(value));
      timestampEl.textContent = date.toLocaleTimeString(undefined, {
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

    // Custom attachment chips (AparteConfig.setAttachmentRenderer) — one node per
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
      const name = this._escapeHtml(a.name);
      if (a.type.startsWith('image/')) {
        return `<div class="aparte-thumb aparte-thumb--image" title="${name}">`
          + `<img class="aparte-thumb__img" src="${this._escapeHtml(a.url)}" alt="${name}" loading="lazy" />`
          + `<span class="aparte-thumb__name">${name}</span></div>`;
      }
      return `<div class="aparte-thumb aparte-thumb--file" title="${name}">`
        + `<span class="aparte-thumb__ext">${this._escapeHtml(this._fileExt(a.name))}</span>`
        + `<span class="aparte-thumb__name">${name}</span></div>`;
    }).join('');

    // Image tiles open the full-size preview lightbox (app-owned modal).
    this._attachmentsEl.querySelectorAll('.aparte-thumb--image').forEach(tile => {
      tile.addEventListener('click', () => {
        const img = tile.querySelector('.aparte-thumb__img') as HTMLImageElement | null;
        if (!img) return;
        this.dispatchEvent(new CustomEvent('aparte-attachment-preview', {
          bubbles: true, composed: true,
          detail: { url: img.src, name: tile.getAttribute('title') ?? '' },
        }));
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

  private _setupBranchPickerListeners(): void {
    const prevBtn = this._branchPickerEl?.querySelector('.aparte-branch-prev');
    const nextBtn = this._branchPickerEl?.querySelector('.aparte-branch-next');

    const dispatchNav = (direction: 'prev' | 'next') => {
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

    prevBtn?.addEventListener('click', () => dispatchNav('prev'));
    nextBtn?.addEventListener('click', () => dispatchNav('next'));
  }

  private _updateBranchPicker(): void {
    if (!this._branchPickerEl) return;
    if (this._siblingCount <= 1 || this._role !== 'assistant') {
      this._branchPickerEl.hidden = true;
      return;
    }
    this._branchPickerEl.hidden = false;
    const label = this._branchPickerEl.querySelector('.aparte-branch-label');
    if (label) {
      // Custom position indicator (AparteConfig.setSiblingNavRenderer) — e.g. dots —
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
        // Default user set: copy + edit.
        if (config.copy) buttons.push(this._actionButtonHtml('copy', icons, locale));
        if (config.edit) buttons.push(this._actionButtonHtml('edit', icons, locale));
      }
    } else if (this._role === 'assistant') {
      if (config.assistant) {
        // Explicit ordered set replaces the flag defaults (incl. the info button).
        for (const a of config.assistant) buttons.push(this._actionButtonHtml(a, icons, locale));
      } else {
        // Default assistant set: copy + retry + feedback (+ info when usage present).
        if (config.copy) buttons.push(this._actionButtonHtml('copy', icons, locale));
        if (config.retry) buttons.push(this._actionButtonHtml('retry', icons, locale));
        if (config.feedback) {
          buttons.push(this._actionButtonHtml('thumbUp', icons, locale));
          buttons.push(this._actionButtonHtml('thumbDown', icons, locale));
        }

        // Info button — opens the stats popover. The popover UI itself is
        // owned by the app layer (it listens for `aparte-message-info`); the
        // bubble only renders the trigger and forwards the usage payload.
        if (this._usage) {
          const infoLabel = locale.messageInfo ?? 'Details';
          buttons.push(`<button class="aparte-action-btn aparte-action-info" data-action="info" aria-label="${infoLabel}" title="${infoLabel}">
          ${INFO_ICON_SVG}
        </button>`);
        }
      }
    }

    this._actionBarEl.innerHTML = buttons.join('');

    // Custom actions registered via AparteConfig.registerAction — appended
    // after the built-ins, built as DOM (label goes to attributes, never
    // interpolated into innerHTML) so a consumer label can't inject markup.
    this._appendCustomActions(icons);

    // Wire up button handlers — messageId read dynamically at click time
    // so it's always correct even when Angular sets the attribute after connectedCallback
    this._actionBarEl.querySelectorAll('.aparte-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleActionClick(e as MouseEvent));
    });
  }

  /** Append the registered custom action buttons for this bubble's role. */
  private _appendCustomActions(icons: ReturnType<AparteConfigClass['getIconProvider']>): void {
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
    icons: ReturnType<AparteConfigClass['getIconProvider']>,
    locale: ReturnType<AparteConfigClass['getLocale']>,
  ): string {
    switch (action) {
      case 'copy': {
        const l = locale.copy ?? 'Copy';
        return `<button class="aparte-action-btn aparte-action-copy" data-action="copy" aria-label="${l}" title="${l}">${icons.copy()}</button>`;
      }
      case 'edit': {
        const l = locale.edit ?? 'Edit message';
        return `<button class="aparte-action-btn aparte-action-edit" data-action="edit" aria-label="${l}" title="${l}">${icons.edit()}</button>`;
      }
      case 'retry': {
        const l = locale.retry ?? 'Retry';
        return `<button class="aparte-action-btn aparte-action-retry" data-action="retry" aria-label="${l}" title="${l}">${icons.retry()}</button>`;
      }
      case 'thumbUp': {
        const l = locale.feedbackPositive ?? 'Good response';
        return `<button class="aparte-action-btn aparte-action-feedback-pos" data-action="feedback-positive" aria-label="${l}" title="${l}">${icons.thumbUp()}</button>`;
      }
      case 'thumbDown': {
        const l = locale.feedbackNegative ?? 'Bad response';
        return `<button class="aparte-action-btn aparte-action-feedback-neg" data-action="feedback-negative" aria-label="${l}" title="${l}">${icons.thumbDown()}</button>`;
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
      `aria-label="${saveLabel}" title="${saveLabel}">${this._cfg.getIcon('check')}</button>` +
      `<button class="aparte-action-btn aparte-action-edit-cancel" data-action="edit-cancel" ` +
      `aria-label="${cancelLabel}" title="${cancelLabel}">${this._cfg.getIcon('close')}</button>`;
    this._actionBarEl.querySelectorAll('.aparte-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleActionClick(e as MouseEvent));
    });
  }

  private _handleActionClick(e: MouseEvent): void {
    const btn = (e.currentTarget as HTMLElement);
    const action = btn.dataset['action'];
    // Read dynamically — attribute may not be set yet at render time
    const messageId = this.getAttribute('message-id');

    // Custom actions (AparteConfig.registerAction) emit a generic aparte-action
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
        const text = this._content || this._segments.map(s => (s as any).content ?? '').join('\n');
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

  private _escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
    // Streaming just finished: highlight the final content once (skipped during
    // streaming to avoid re-highlighting on every token).
    if (wasStreaming && !streaming) this._highlightContentCode();
  }
}

// Register the custom element
if (!customElements.get('aparte-chat-bubble')) {
  customElements.define('aparte-chat-bubble', AparteChatBubble);
}

declare global {
  interface HTMLElementTagNameMap {
    'aparte-chat-bubble': AparteChatBubble;
  }
}
