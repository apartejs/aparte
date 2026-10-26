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
  AparteFinishReason,
  AparteMessage,
  AparteContextSummary,
  AparteCompactEventDetail,
  AparteToolCallSegment,
  AparteSegmentRenderer,
  AparteToolRenderer,
} from '../../types/index.js';
import { getSegmentRenderer, installDefaultRenderersOnce } from '../../renderers/index.js';

/**
 * A segment as drawn: its element, the renderer that drew it and — for a tool call — the
 * tool renderer in effect then. Kept so `cleanup` reaches the renderer that DREW the
 * element, and so a registry change can tell which segments to draw again.
 */
interface DrawnSegment {
  el: HTMLElement;
  renderer: AparteSegmentRenderer | undefined;
  tool: AparteToolRenderer | null;
  segment: AparteSegment;
}
import { writeStreamedMarkdown, type AparteMarkdownStreamHost } from '../../renderers/markdown-stream.js';
import { AparteConfig, aparteGlobalConfig, onRenderersChange, renderingVersionOf } from '../../config/aparte-config.js';
import { isMountedRenderer } from '../../renderers/mounted-renderer.js';
import { toolCallRenderer, toolRendererThatDrew } from '../../renderers/segments/tool-call.js';
import { resolveConfig, runWithConfig, type AparteConfigAware } from '../../config/config-context.js';
import { chatBoundaryOf } from '../../utils/chat-boundary.js';
import { cssEscape } from '../../utils/css-escape.js';
import { copyText } from '../../utils/copy-text.js';
import { mergeSegmentUpdate, isSegmentSettled } from '../../utils/segments.js';
import type { AparteComposerInput } from '../composer/aparte-composer-input.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';
import { isSafeUrl } from '../../config/sanitize.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';
import { restoreContext } from '../../context/restore.js';
import { buildCheckpointSeparator, type CheckpointKind } from './checkpoint-separator.js';

/**
 * Warn ONCE when a segment has no renderer — only for types core has never heard of,
 * since the built-ins install themselves on first use.
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
 * A custom segment arriving where its renderer is not registered (a conversation
 * replayed in another app, a client that loads its views lazily, an export) shows its
 * `AparteCustomSegment.fallback` text. Without one it shows
 * `[Unknown segment type: custom]`.
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
 * Empty avatar slots waiting to learn whether their role's `--aparte-avatar-image-*` names a
 * picture, with the bubble and the role each one reads. Flushed together in one microtask, so
 * a config change that redraws every bubble reads every token first and marks afterwards: a
 * mark set between two reads dirtied the style the next read had to recompute.
 *
 * The token is read on the bubble, not on the slot. A bubble off screen skips its contents
 * (`content-visibility: auto`), and reading a computed style inside a skipped subtree costs a
 * style pass of its own: on 200 messages that was ~50ms per config change in Chromium. So
 * the token is honoured where it is declared on the bubble or any ancestor — `:root`, the
 * chat — which is where the guide declares it.
 */
const pendingAvatarMarks = new Map<HTMLElement, { bubble: HTMLElement; role: string }>();

function flushAvatarMarks(): void {
    const batch = [...pendingAvatarMarks].filter(([avatar]) => !avatar.firstChild);
    pendingAvatarMarks.clear();
    const shown = batch.map(([, { bubble, role }]) => {
        const image = getComputedStyle(bubble).getPropertyValue(`--aparte-avatar-image-${role}`).trim();
        return image !== '' && image !== 'none';
    });
    batch.forEach(([avatar], i) => avatar.toggleAttribute('data-image', shown[i]));
}

/** Hands each bubble its own `id` for the separator's panel, so two bubbles' `aria-controls` never point at one element. */
let checkpointIds = 0;

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
 * All eight events are declared by hand rather than left to the analyser.
 *
 * The bubble element is `content-visibility: auto` for its streaming/scroll performance
 * (see `bubble.css`), and that containment makes the bubble
 * the containing block for `position: fixed` descendants: a popover mounted inside it
 * (an `<aparte-select>` from a `registerToolRenderer` renderer, say) is clipped to the
 * bubble's own box, not the window. Mount it outside instead — [Custom tool
 * renderer](https://apartejs.dev/guides/tools/#custom-tool-renderer) shows the pattern.
 *
 * @element aparte-chat-bubble
 *
 * @attr {string} data-role - The message role, `user` or `assistant` — the one channel for it, and what the CSS keys off. (`role` is ARIA's attribute; this element sets it to `article` itself and does not read a message role from it.)
 * @attr {string} content - Plain text content, for a bubble with no segments.
 * @attr {number | string} timestamp - Epoch milliseconds or a date string; a numeric string is read as milliseconds.
 * @attr {string} message-id - How streaming and the action bar address this bubble.
 * @attr {boolean} streaming - Hides the action bar and shows the caret while a reply is in flight.
 * @attr {string} data-checkpoint - `pending` or `failed`: what a compaction is doing to this message, which it will carry as a checkpoint. The viewport and the framework host set it from `aparte-compact-start` / `-error` and take it off again; the bubble draws the separator's "Summarising the context…" or Retry from it. Read it, do not write it.
 * @attr {string} data-checkpoint-reason - Why the compaction failed, beside `data-checkpoint="failed"`: the separator gives it as the failure's tooltip and to screen readers. Set and cleared with `data-checkpoint`; read it, do not write it.
 * @attr {string} name - Who wrote the message: shown in the header, and the message's accessible name ("Message from {name}"). Leave it out for the reader and the assistant, whose names come from the locale.
 *
 * @fires {CustomEvent<AparteActionEventDetail>} aparte-action - A custom action-bar button was pressed.
 * @fires {CustomEvent<AparteRetryEventDetail>} aparte-retry - Retry was pressed; the host forks the turn.
 * @fires {CustomEvent<AparteEditEventDetail>} aparte-edit - An edit was saved.
 * @fires {CustomEvent<AparteFeedbackEventDetail>} aparte-feedback - Thumbs up or down.
 * @fires {CustomEvent<AparteMessageInfoEventDetail>} aparte-message-info - The info affordance was pressed.
 * @fires {CustomEvent<AparteBranchNavigateEventDetail>} aparte-branch-navigate - The `‹1/2›` picker moved between sibling versions.
 * @fires {CustomEvent<AparteAttachmentPreviewEventDetail>} aparte-attachment-preview - An attached image was clicked, asking the app to open it full-size.
 * @fires {CustomEvent<AparteCompactEventDetail>} aparte-compact - Retry was pressed on a summary that failed: asks whatever answers compaction (`@aparte/plugin-compaction`) to try again for this chat. Dispatched on `window`.
 * @fires {CustomEvent<AparteCompactDoneEventDetail>} aparte-compact-done - Restore was confirmed: every checkpoint was removed and the model reads the original messages again. `detail.restored` is `true`. Dispatched on `window`.
 * @fires {CustomEvent<AparteLinkClickEventDetail>} aparte-link-click - A link in the message body is about to be followed. Cancelable: `preventDefault()` keeps the browser from navigating, so a host can route the link itself.
 *
 * @cssprop [--aparte-message-gap=var(--aparte-space-6)] - Gap between the avatar column and the body (the viewport reuses it between messages).
 * @cssprop [--aparte-message-padding-block=var(--aparte-space-8)] - Vertical padding of one message row.
 * @cssprop [--aparte-message-padding-inline=var(--aparte-space-6)] - Horizontal padding of one message row.
 * @cssprop [--aparte-message-max-width=800px] - Width of the centred message row.
 *
 * @cssprop [--aparte-message-content-radius=var(--aparte-radius-bubble)] - Radius of the painted content box.
 * @cssprop [--aparte-message-content-padding=var(--aparte-space-5) var(--aparte-space-7)] - Padding of the user's box.
 * @cssprop [--aparte-message-content-padding-assistant=0] - Padding of the assistant's box, none by default: its reply is plain prose across the column.
 * @cssprop --aparte-message-content-bg-user - Background of the user box: a wash of `--aparte-primary` over `--aparte-surface-1`, derived in `theme.css` so a rebrand moves it (declare it to override).
 * @cssprop [--aparte-message-content-bg-assistant=transparent] - Background of the assistant box — transparent on purpose (AI-chat convention, not messaging).
 * @cssprop --aparte-message-content-text-user - Colour of the user's words. Unset by default: they keep `--aparte-content-color`.
 * @cssprop --aparte-message-content-text-assistant - Colour of the assistant's words. Unset by default: they keep `--aparte-content-color`.
 *
 * @cssprop [--aparte-avatar-size=32px] - Square size of the avatar slot.
 * @cssprop [--aparte-avatar-radius-ratio=0.28] - Avatar corner radius, as a fraction of its size (the corner follows the ramp).
 * @cssprop [--aparte-avatar-initials-ratio=0.34] - Size of the initial, as a fraction of the avatar's size.
 * @cssprop [--aparte-avatar-bg-user=var(--aparte-primary)] - Avatar background, user role.
 * @cssprop [--aparte-avatar-text-user=var(--aparte-text-inverse)] - Avatar text colour, user role.
 * @cssprop [--aparte-avatar-bg-assistant=var(--aparte-surface-3)] - Avatar background, assistant role.
 * @cssprop [--aparte-avatar-text-assistant=var(--aparte-text)] - Avatar text colour, assistant role.
 * @cssprop [--aparte-avatar-image-user=none] - `background-image` for the user avatar — a logo with no AvatarProvider: the slot shows when it names an image.
 * @cssprop [--aparte-avatar-image-assistant=none] - `background-image` for the assistant avatar.
 * @cssprop [--aparte-avatar-image-size=90%] - `background-size` for both avatar images.
 *
 * @cssprop [--aparte-name-font-size=var(--aparte-font-size-md)] - Sender name in the header.
 * @cssprop [--aparte-name-color=var(--aparte-text)] - Sender name colour.
 * @cssprop [--aparte-timestamp-font-size=var(--aparte-font-size-sm)] - Timestamp in the header.
 * @cssprop [--aparte-timestamp-color=var(--aparte-text-muted)] - Timestamp colour.
 * @cssprop [--aparte-content-font-size=var(--aparte-font-size-base)] - Body type size, applied to both the plain-content and the segments container.
 * @cssprop [--aparte-content-color=var(--aparte-text)] - Body text colour.
 * @cssprop [--aparte-content-line-height=var(--aparte-line-height-loose)] - Body line height.
 *
 * @cssprop [--aparte-attachments-max-height=140px] - Cap on the sent-attachment strip; past it the strip scrolls instead of growing.
 * @cssprop [--aparte-attachment-image-size=72px] - Tile size in the strip. The strip re-declares the global 72px down to 40px, since these are thumbnails inside a conversation, and to 56px on a coarse pointer, where the file name is always shown.
 * @cssprop [--aparte-thumb-radius=var(--aparte-radius-lg)] - Attachment tile radius (shared with the composer's preview tiles).
 * @cssprop [--aparte-thumb-name-color=#ffffff] - Filename overlaid on a tile.
 * @cssprop --aparte-thumb-name-scrim - Gradient behind that filename, so it stays legible over any image.
 * @cssprop [--aparte-thumb-name-padding=14px 5px 4px] - Padding of the filename overlay. On a coarse pointer, where the name is always shown, the stylesheet re-sets it to `6px 4px 3px` on `.aparte-thumb` itself, which wins over a value inherited from your theme: target `.aparte-thumb` to change it there.
 *
 * @cssprop [--aparte-action-bar-gap=var(--aparte-space-2)] - Gap between action buttons (and between the footer's two regions).
 * @cssprop [--aparte-action-bar-btn-size=var(--aparte-btn-size-sm)] - Square size of an action button (the recipe's small step); also the footer's reserved height.
 * @cssprop [--aparte-action-bar-btn-color=var(--aparte-text-muted)] - Action icon colour at rest.
 * @cssprop [--aparte-action-bar-btn-hover-bg=var(--aparte-surface-2)] - Action button hover background (the branch arrows reuse it).
 * @cssprop [--aparte-action-bar-btn-hover-color=var(--aparte-text)] - Action icon colour on hover.
 *
 * @cssprop [--aparte-branch-picker-gap=var(--aparte-space-2)] - Gap between the arrows and the position label.
 * @cssprop [--aparte-branch-picker-btn-color=var(--aparte-text-muted)] - Arrow colour at rest.
 * @cssprop [--aparte-branch-picker-btn-hover-color=var(--aparte-text)] - Arrow colour on hover (a disabled arrow is dimmed instead).
 * @cssprop [--aparte-branch-picker-label-size=var(--aparte-font-size-sm)] - Type size of the position label.
 * @cssprop [--aparte-branch-picker-label-color=var(--aparte-text-muted)] - Colour of the position label.
 * @cssprop [--aparte-branch-picker-label-min-width=32px] - Reserved label width, so `9 / 9` growing to `10 / 12` does not shift the arrows.
 *
 * @cssprop [--aparte-waiting-height=1.5em] - Min height of the waiting region, so the first token does not jump the layout.
 * @cssprop [--aparte-waiting-dot-gap=var(--aparte-space-2)] - Gap between the three waiting dots.
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
 *   content="A second take on the same question."
 * ></aparte-chat-bubble>
 *
 * <script>
 *   document.querySelector('aparte-chat-bubble[message-id="a3"]').setSiblings(2, 0);
 * </script>
 */
export class AparteChatBubble extends HTMLElement implements AparteConfigAware {
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
  private _finishReason: AparteFinishReason | null = null;
  /** The checkpoint this message carries: the separator above it is drawn from it. */
  private _contextSummary: AparteContextSummary | null = null;
  /**
   * This message is one an older compaction wrote (`compaction: true`), as the host told
   * us. `null` until told: the `data-kind="compaction"` attribute the viewport and the
   * wrappers stamp from the same flag answers meanwhile.
   */
  private _legacyCompaction: boolean | null = null;
  /** The summary panel under the separator is open. Kept here, not in the DOM, because a redraw rebuilds the DOM. */
  private _checkpointOpen = false;
  /** Restore asked for confirmation and has not been answered. */
  private _confirmingRestore = false;
  /** What the separator was last drawn from, so a re-sync that changes nothing leaves it (and a focused button) alone. */
  private _checkpointDrawn = '';
  /** Names the separator's panel for `aria-controls`, unique on the page without needing a message id. */
  private readonly _checkpointId = `aparte-checkpoint-${++checkpointIds}`;
  /** Cleanup returned by the avatar provider — called on disconnect/re-render. */
  private _avatarCleanup: (() => void) | null = null;
  /** Whether the avatar slot holds what a provider drew, which goes when the provider does. */
  private _avatarFromProvider = false;
  /** Sibling count for tree-based branch navigation (set by setSiblings()) */
  private _siblingCount = 1;
  /**
   * Which accessible names the bubble wrote itself, and so may refresh on a language switch
   * or a name change. A custom shell's own are its author's: refreshed, a root's or a bar's
   * label of their own became "Assistant response" or "Message actions" at the first notify.
   */
  private _wroteRootLabel = false;
  private _wroteBarLabel = false;
  private _wroteArrowLabels = false;
  /** The shell renderer the bubble was last drawn with (`null`: the default frame). */
  private _drawnShell: unknown = null;
  /** Sibling index for tree-based branch navigation (set by setSiblings()) */
  private _siblingIndex = 0;
  /** True while the user-message inline editor is open. */
  private _editing = false;
  /** The live inline editor (the composer's contenteditable primitive), present only while `_editing`. */
  private _editInput: AparteComposerInput | null = null;
  /**
   * The `data-action` of the button the editor was opened from, so leaving it can hand
   * the keyboard back. The STRING, not the node: entering and leaving edit mode rewrite
   * the action bar's `innerHTML`, so the opener's identity is destroyed twice.
   */
  private _editReturnAction: string | null = null;

  static get observedAttributes(): string[] {
    // `data-role` is the ONE channel for the message role. `role` is ARIA's
    // attribute — this element writes `role="article"` on itself in _render() —
    // and it used to be read as a legacy message-role channel too, which meant
    // filtering our own "article" back out at every turn. A rename lands as a
    // rename pre-1.0, so the overload is gone.
    return ['data-role', 'content', 'timestamp', 'message-id', 'streaming', 'name', 'data-checkpoint', 'data-checkpoint-reason'];
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
    this._updateFinishNote();
    // The separator's words are locale and its summary is Markdown: drawn again, not patched.
    this._checkpointDrawn = '';
    this._updateCheckpoint();
    // An avatar provider is config too, and it was the one provider a live change
    // never reached: swap the set and every bubble already on screen kept the old
    // one. `_renderAvatar` tears down the previous mount before re-mounting, so
    // calling it again is safe, and it no-ops when no provider is registered.
    this._renderAvatar();
    // A renderer swapped for some segments first (they are drawn anew, so nothing to
    // relabel there), then every segment still on its own renderer re-reads its text.
    this._redrawSegmentsWhoseRendererChanged();
    this._relabelSegments();
    // The clock, too. A tag change is a formatting change, so the timestamp has to
    // be re-rendered or the language switches around a 12-hour time that stays.
    this._updateTimestamp(this.getAttribute('timestamp'));
    // Once, in a microtask: the usual setup sets the Markdown provider, its streaming twin
    // and a highlighter one after another, and each notifies — drawn on each, every message
    // on screen was parsed three times over.
    if (!this._redrawQueued) {
      this._redrawQueued = true;
      queueMicrotask(() => {
        this._redrawQueued = false;
        if (this.isConnected) this._redrawIfStale();
      });
    }
  };

  /** A {@link _redrawIfStale} is queued for the end of the current task. */
  private _redrawQueued = false;

  /** The {@link renderingVersionOf} count the content was last drawn with. */
  private _drawnWithVersion = 0;

  /** Every segment on screen, by id: see {@link DrawnSegment}. */
  private _drawn = new Map<string, DrawnSegment>();

  /** The segments were released because the bubble was still out of the page at the next microtask. */
  private _releasedWhileDetached = false;

  /** A {@link _scheduleReleaseCheck} is queued. */
  private _releaseCheckQueued = false;

  /** Unsubscribes from the renderer registries' channel; set while connected. */
  private _offRenderers: (() => void) | null = null;

  /** The tool renderer in effect for a call: none for a hidden call or another segment. */
  private _toolRendererFor(segment: AparteSegment): AparteToolRenderer | null {
    if (segment.type !== 'tool_call') return null;
    const cfg = this._cfg;
    // Only core's row consults the tool renderers: a tool_call renderer of the app's own never
    // does, so a tool renderer matching the call is not what draws it.
    if (resolveSegmentRenderer('tool_call', cfg) !== toolCallRenderer) return null;
    const name = (segment as AparteToolCallSegment).toolCall?.name;
    if (!name || cfg.isToolHidden(name)) return null;
    return cfg.getToolRenderer(name) ?? null;
  }

  /**
   * Record a segment as drawn, set it up, then read back which tool renderer is behind the
   * row (tool-call.ts records it as the row is set up — one record, not a second lookup).
   * Recorded BEFORE `setup`: a setup that throws (a framework mount) leaves an element that
   * will still be cleaned up. The same id drawn twice releases the first element.
   */
  private _install(segment: AparteSegment, el: HTMLElement, renderer: AparteSegmentRenderer | undefined): void {
    const previous = this._drawn.get(segment.id);
    if (previous && previous.el !== el) this._release(segment.id);
    const drawn: DrawnSegment = { el, renderer, tool: null, segment };
    this._drawn.set(segment.id, drawn);
    // Drawn into a bubble that is out of the page (a late write after its removal): decide
    // again, so what was just mounted cannot outlive it.
    if (!this.isConnected) this._scheduleReleaseCheck();
    if (renderer?.setup) runWithConfig(this._cfg, () => renderer.setup!(el, segment));
    if (segment.type === 'tool_call') drawn.tool = toolRendererThatDrew(el);
  }

  /**
   * The segment's element leaves for good: its renderer's `cleanup`, once. A cleanup that
   * throws is reported and costs nothing else — the element still goes, and the others
   * are still released.
   */
  private _release(id: string): void {
    const drawn = this._drawn.get(id);
    if (!drawn) return;
    this._drawn.delete(id);
    const cleanup = drawn.renderer?.cleanup;
    if (!cleanup) return;
    try {
      runWithConfig(this._cfg, () => cleanup.call(drawn.renderer, drawn.el, drawn.segment));
    } catch (err) {
      console.error('[aparte] a segment renderer\'s cleanup threw', err);
    }
  }

  private _releaseAll(): void {
    for (const id of [...this._drawn.keys()]) this._release(id);
  }

  /**
   * Gone for good, or only moved? A keyed list moving a row takes it out and puts it back
   * before the next microtask, and must not unmount what its segments hold: decide then.
   */
  private _scheduleReleaseCheck(): void {
    if (this._releaseCheckQueued) return;
    this._releaseCheckQueued = true;
    queueMicrotask(() => {
      this._releaseCheckQueued = false;
      if (this.isConnected || this._drawn.size === 0) return;
      this._releaseAll();
      this._releasedWhileDetached = true;
    });
  }

  /** One segment drawn again in place: its renderer cleans up, the current one draws. False when it was never drawn. */
  private _redrawSegment(segment: AparteSegment): boolean {
    const drawn = this._drawn.get(segment.id);
    if (!drawn) return false;
    const cfg = this._cfg;
    const renderer = resolveSegmentRenderer(segment.type, cfg);
    const old = drawn.el;
    this._release(segment.id);
    const el = renderer
      ? segmentRenderResultToElement(runWithConfig(cfg, () => renderer.render(segment)), segment)
      : unrenderedSegment(segment);
    if (!el) { old.remove(); return true; }
    old.replaceWith(el);
    this._install(segment, el, renderer);
    return true;
  }

  /** The renderer that drew this segment is still the one in effect (for a tool call, the tool renderer too). */
  private _stillDrawnByCurrent(segment: AparteSegment, drawn: DrawnSegment): boolean {
    return resolveSegmentRenderer(segment.type, this._cfg) === drawn.renderer
      && this._toolRendererFor(segment) === drawn.tool;
  }

  /**
   * A renderer registered, unregistered or overridden since these segments were drawn: draw
   * again only the segments whose renderer is no longer the one that drew them (for a tool
   * call, the tool renderer counts), in place. The others keep their elements — and with
   * them anything mounted in them, which a redraw of the whole message would unmount.
   */
  private _redrawSegmentsWhoseRendererChanged(): void {
    if (!this.isConnected || !this._segmentsEl || this._drawn.size === 0) return;
    for (const segment of this._segments) {
      const drawn = this._drawn.get(segment.id);
      if (!drawn || this._stillDrawnByCurrent(segment, drawn)) continue;
      this._redrawSegment(segment);
    }
  }

  /**
   * The registries' channel: a renderer changed on our config — or on the global one, whose
   * segment renderers a chat with its own config inherits.
   */
  private _onRenderersChange = (cfg: AparteConfig): void => {
    if (cfg !== this._cfg && cfg !== aparteGlobalConfig) return;
    this._redrawSegmentsWhoseRendererChanged();
  };

  /**
   * A card a mounted renderer keeps (a framework component): its drawing reads none of the
   * providers a rendering-version bump announces, so it stays mounted through one — as long
   * as that renderer is still the one in effect.
   */
  private _keepsItsDrawing(segment: AparteSegment, drawn: DrawnSegment): boolean {
    const mounted = isMountedRenderer(drawn.renderer) || (segment.type === 'tool_call' && isMountedRenderer(drawn.tool));
    return mounted && this._stillDrawnByCurrent(segment, drawn);
  }

  /**
   * A Markdown or highlight provider set after this message was drawn: draw it again.
   * Not mid-stream — the stream reads the providers as it goes, and its end redraws — and
   * not mid-edit, where the drawn message is hidden behind the editor and drawing it would
   * show it again beside the editor; leaving the edit calls this.
   *
   * Segment by segment, keeping the cards a mounted renderer holds: a highlighter that loads
   * after the first answer must not remount every card on the page and lose its state.
   */
  private _redrawIfStale(): void {
    if (this._streaming || this._editing || renderingVersionOf(this._cfg) === this._drawnWithVersion) return;
    if (this._segments.length === 0) { this._updateContent(); return; }
    if (this._segments.some((s) => !this._drawn.has(s.id))) { this._renderSegments(); return; }
    this._drawnWithVersion = renderingVersionOf(this._cfg);
    for (const segment of this._segments) {
      const drawn = this._drawn.get(segment.id)!;
      if (this._keepsItsDrawing(segment, drawn)) continue;
      this._redrawSegment(segment);
    }
    this._reflectError();
    this._syncCopyAction();
  }

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
    if (this._wroteArrowLabels) {
      set('.aparte-branch-prev', locale.previousResponse ?? 'Previous response');
      set('.aparte-branch-next', locale.nextResponse ?? 'Next response');
    }
    if (this._wroteBarLabel) set('.aparte-action-bar', locale.messageActions ?? 'Message actions');
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
    // Back after an absence long enough that its segments were cleaned up (a framework's
    // keep-alive cache, a reused route): draw them again. `_render()` kept the frame.
    if (this._releasedWhileDetached) {
      this._releasedWhileDetached = false;
      if (this._segments.length > 0) this._renderSegments();
    }
    window.addEventListener('aparte-config-change', this._onConfigChange);
    this._offRenderers ??= onRenderersChange(this._onRenderersChange);
    // Delegated, so a re-render cannot lose a click on the branch arrows.
    this.addEventListener('click', this._onBranchPickerClick);
    this.addEventListener('click', this._onLinkClick);
    this.addEventListener('click', this._onCheckpointClick);
    this.addEventListener('keydown', this._onCheckpointKeydown);
  }

  /**
   * The boundary above this bubble changed — under every wrapper the chat's own config is
   * attached AFTER the first messages are drawn. When that brings another frame
   * (`setBubbleShellRenderer`), the bubble is drawn again in it and its content put back,
   * so every message wears the chat's frame.
   *
   * Deferred to a microtask: a wrapper detaches the boundary as it unmounts (Vue's
   * `onBeforeUnmount`, Svelte's `onDestroy`), while the bubbles are still in the page, and
   * redrawing every one of them just before their removal would cost a frame per message.
   * After the microtask a removed bubble is no longer connected, and repeated notices fold
   * into one.
   */
  aparteConfigChanged(): void {
    queueMicrotask(() => {
      this._redrawFrameIfChanged();
      // The chat's own config may draw a call or a segment with another renderer than the
      // global config these rows were drawn under (a card it declares): those rows follow.
      this._redrawSegmentsWhoseRendererChanged();
    });
  }

  private _redrawFrameIfChanged(): void {
    if (!this.isConnected || this._editing) return;   // an open editor is the reader's: caught up when it closes
    if ((this._cfg.getBubbleShellRenderer?.() ?? null) === this._drawnShell) return;
    if (this._avatarCleanup) {
      try { this._avatarCleanup(); } catch { /* ignore */ }
      this._avatarCleanup = null;
    }
    // The incremental Markdown parser is bound to the content element being replaced: left
    // bound, a stream would go on writing into the detached one and end blank.
    this._resetMarkdownStream();
    // The segments go with the old frame: their renderers clean up before it is dropped.
    this._releaseAll();
    this.replaceChildren();
    this._render();
    this._updateContent();
    if (this._segments.length > 0) this._renderSegments();
    this._updateAttachments();
    this._updateTimestamp(this.getAttribute('timestamp'));
    this._updateBranchPicker();
    // `_render` drew it, into the new frame; named here too because this list is what a
    // frame change has to put back, and the separator sits OUTSIDE the frame (a custom
    // shell's root is `.aparte-message`, which the separator must not live in).
    this._updateCheckpoint();
  }

  disconnectedCallback(): void {
    window.removeEventListener('aparte-config-change', this._onConfigChange);
    this._offRenderers?.();
    this._offRenderers = null;
    this.removeEventListener('click', this._onBranchPickerClick);
    this.removeEventListener('click', this._onLinkClick);
    this.removeEventListener('click', this._onCheckpointClick);
    this.removeEventListener('keydown', this._onCheckpointKeydown);
    if (this._avatarCleanup) {
      try { this._avatarCleanup(); } catch { /* ignore */ }
      this._avatarCleanup = null;
    }
    this._scheduleReleaseCheck();
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
      case 'data-checkpoint':
        this._updateCheckpoint();
        break;
      case 'data-checkpoint-reason':
        // The reason only shows on a failure. A second failure keeps `data-checkpoint` as it
        // is and changes just this, so the separator would keep the first failure's words;
        // outside `failed` the state's own change draws it, with the reason it finds.
        if (this.getAttribute('data-checkpoint') === 'failed') this._updateCheckpoint();
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
    this._syncCopyAction();
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
    this._syncCopyAction();
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
    this._replaceSegments(segments);
    this._updateWaiting();
  }

  /** A whole new list, from `setSegments` or `updateMessage({ segments })`: copied in, then drawn. */
  private _replaceSegments(segments: AparteSegment[]): void {
    const next = [...segments];
    if (this._resyncKeepingCards(next)) return;
    this._segments = next;
    this._renderSegments();
  }

  /**
   * The same segments again, in the same order — the host re-syncing a message when its turn
   * ends — while a mounted renderer holds one of them: the cards it holds are handed the new
   * state, and only the other segments are drawn again, in place. Drawing everything again
   * unmounted every framework card at the end of every turn and lost its state. False, and
   * nothing touched, in every other case: those keep the full redraw.
   */
  private _resyncKeepingCards(next: AparteSegment[]): boolean {
    if (!this._segmentsEl || next.length !== this._segments.length) return false;
    if (next.some((s, i) => s.id !== this._segments[i]!.id || !this._drawn.has(s.id))) return false;
    const kept = new Set(next.filter((s) => this._keepsItsDrawing(s, this._drawn.get(s.id)!)).map((s) => s.id));
    if (kept.size === 0) return false;

    this._segments = next;
    this._drawnWithVersion = renderingVersionOf(this._cfg);
    for (const segment of next) {
      if (kept.has(segment.id)) this._applySegmentUpdate(segment.id, segment, segment);
      else this._redrawSegment(segment);
    }
    this._reflectError();
    this._syncCopyAction();
    return true;
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
      this._syncCopyAction();
      // A call that settles is a step that ended: the dots may be due again.
      if ('status' in updates || 'isStreaming' in updates) this._updateWaiting();
    }
  }

  /** Append content to a segment */
  appendToSegment(segmentId: string, content: string): void {
    const segment = this._segments.find(s => s.id === segmentId);
    if (segment && 'content' in segment) {
      (segment as { content: string }).content += content;
      this._applySegmentUpdate(segmentId, segment, { content: (segment as AparteSegment & { content: string }).content });
      this._syncCopyAction();
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
   * in an earlier segment's prose would win over the real segment element.
   *
   * Parser ids are unguessable UUIDs, but a tool segment is `tool-${toolCallId}`
   * and the MODEL chooses that id — so a decoy could point an update at the wrong
   * element and leave a rejected tool rendering as still-running: a spoof against
   * the human-in-the-loop control.
   */
  removeSegment(segmentId: string): void {
    const index = this._segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      this._segments.splice(index, 1);
    }
    this._release(segmentId);
    const el = this._segmentsEl?.querySelector(`:scope > [data-segment-id="${cssEscape(segmentId)}"]`);
    el?.remove();
    this._updateWaiting();
    this._syncCopyAction();
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
   * Say why the model stopped writing this reply (assistant only).
   *
   * Only `'length'` draws anything: a quiet note after the content that the reply was cut
   * off, because otherwise a truncated answer reads as a finished one. Every other reason
   * is the ordinary end of a turn and says nothing. The note waits for the turn to settle.
   */
  setFinishReason(reason: AparteFinishReason | null | undefined): void {
    this._finishReason = reason ?? null;
    this._updateFinishNote();
  }

  /**
   * Say that the messages before this one were summarised for the model, or that they no
   * longer are (`null`).
   *
   * Draws, or removes, the separator above the message: "{n} messages summarised for the
   * model", with Show summary and Restore. The separator sits OUTSIDE `.aparte-message`
   * and inside this element, so it is not part of the message's frame and survives the
   * frame being drawn again. `legacy: true` says the message is itself the summary an
   * older compaction wrote (`compaction: true`): it is replaced by the separator, which
   * then has no count and no Restore. Omit `legacy` to leave what the host last said (or
   * the `data-kind="compaction"` attribute) in force.
   */
  setContextSummary(summary: AparteContextSummary | null | undefined, options?: { legacy?: boolean }): void {
    this._contextSummary = summary ?? null;
    if (options?.legacy !== undefined) this._legacyCompaction = options.legacy;
    if (!this._contextSummary) {
      this._confirmingRestore = false;
      if (!this._isLegacyCompaction()) this._checkpointOpen = false;
    }
    this._updateCheckpoint();
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
      // writers — the doubling documented on `setSegments` above. The same segments in
      // their final state (the viewport's update when a turn ends) keep their cards.
      this._replaceSegments(updates.segments!);
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
    if ('finishReason' in updates) this.setFinishReason(updates.finishReason);
    if ('contextSummary' in updates || 'compaction' in updates) {
      this.setContextSummary(
        'contextSummary' in updates ? updates.contextSummary : this._contextSummary,
        'compaction' in updates ? { legacy: updates.compaction === true } : undefined,
      );
    }
  }

  /**
   * Draw, or remove, the note under a reply cut off at the model's length limit.
   *
   * Created here rather than in the shell markup: a custom shell written from the contract
   * has no such region, and the note is only ever wanted next to the content it qualifies.
   * A shell with no content region simply shows none (the same null-guarded degradation as
   * the other regions).
   */
  private _updateFinishNote(): void {
    const show = this._finishReason === 'length' && !this._streaming && this._role !== 'user';
    let note = this.querySelector<HTMLElement>('.aparte-finish-note');
    if (!show) {
      note?.remove();
      return;
    }
    if (!note) {
      const region = this.querySelector('.aparte-message-content');
      if (!region) return;
      note = document.createElement('div');
      note.className = 'aparte-finish-note';
      region.after(note);
    }
    note.textContent = this._cfg.getLocale().responseCutOff ?? "Cut off at the model's length limit.";
  }

  /** This message was written by an older compaction, as the host said or as its `data-kind` stamp says. */
  private _isLegacyCompaction(): boolean {
    return this._legacyCompaction ?? this.getAttribute('data-kind') === 'compaction';
  }

  /**
   * What the separator should say, or `null` for none. A compaction in progress or
   * failed outranks what the message already carries: it is what is happening now.
   */
  private _checkpointKind(): CheckpointKind | null {
    const run = this.getAttribute('data-checkpoint');
    if (run === 'pending' || run === 'failed') return run;
    if (this._contextSummary) return 'done';
    return this._isLegacyCompaction() ? 'legacy' : null;
  }

  /** The text the summary panel shows: the checkpoint's summary, or the older compaction message itself. */
  private _checkpointSummaryText(): string {
    return this._contextSummary ? this._contextSummary.summary : this._content;
  }

  /**
   * Draw the separator above the message, or take it off.
   *
   * Written into the light DOM as the FIRST child of the bubble, outside `.aparte-message`:
   * a custom shell roots at that class and is free to be anything, and the separator is not
   * its to carry. Drawn from `_render` (so every frame gets it) and from every setter that
   * changes what it says. A re-sync that changes nothing — the framework host calls this on
   * every render of every bubble — finds the same signature and the element in place and
   * leaves both alone, so a keyboard user's focus and a scrolled summary are not lost to a
   * rebuild; one that does change something rebuilds it and puts the focus back on the
   * button that had it (or on `focus`, which a click that swaps the buttons names).
   *
   * A message an older compaction wrote is marked `data-superseded` on its own row: it
   * stays in the DOM and does not paint (bubble.css), the separator speaking for it.
   */
  private _updateCheckpoint(focus?: string): void {
    const frame = this.querySelector<HTMLElement>('.aparte-message');
    if (!frame) return;   // not drawn yet: `_render` calls this when it is
    const kind = this._checkpointKind();
    frame.toggleAttribute('data-superseded', this._isLegacyCompaction() && !this._contextSummary);

    const current = this.querySelector<HTMLElement>(':scope > .aparte-checkpoint');
    if (!kind) {
      // Restore's confirm button is inside the separator that goes. A focus that dies with
      // its element drops to the page, and a keyboard or screen-reader user loses their
      // place in the transcript; the message the checkpoint sat on is the nearest thing
      // that is still there.
      const holdsFocus = current && document.activeElement && current.contains(document.activeElement);
      current?.remove();
      this._checkpointDrawn = '';
      if (holdsFocus) {
        if (!frame.hasAttribute('tabindex')) frame.setAttribute('tabindex', '-1');
        frame.focus({ preventScroll: true });
      }
      return;
    }

    const reason = this.getAttribute('data-checkpoint-reason') ?? '';
    const summary = this._checkpointSummaryText();
    const signature = JSON.stringify([
      kind, this._contextSummary?.count, this._contextSummary?.createdAt, reason,
      this._checkpointOpen, this._confirmingRestore, this._checkpointOpen ? summary : '',
    ]);
    if (current && !focus && signature === this._checkpointDrawn) return;

    const active = document.activeElement;
    const hadFocus = current && active && current.contains(active)
      ? (active as HTMLElement).getAttribute('data-checkpoint-action')
      : null;

    const next = buildCheckpointSeparator({
      kind,
      count: this._contextSummary?.count,
      reason,
      open: this._checkpointOpen,
      confirming: this._confirmingRestore,
      summaryId: this._checkpointId,
      locale: this._cfg.getLocale(),
    });
    if (this._checkpointOpen && (kind === 'done' || kind === 'legacy')) {
      const panel = next.querySelector<HTMLElement>('.aparte-checkpoint__summary');
      // The configured renderer, as the bubble draws its own content; with none, core's
      // default, which escapes — text.
      if (panel) panel.innerHTML = this._cfg.renderMarkdown(summary);
    }
    if (current) current.replaceWith(next);
    else this.prepend(next);
    this._checkpointDrawn = signature;

    const wanted = focus ?? hadFocus;
    if (wanted) (next.querySelector(`[data-checkpoint-action="${cssEscape(wanted)}"]`) as HTMLElement | null)?.focus();
  }

  /**
   * The separator's buttons. One delegated listener on the bubble, for the reason the branch
   * picker has one: the separator is rebuilt on every change, and a listener per button would
   * be lost with it.
   */
  private _onCheckpointClick = (event: Event): void => {
    const button = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-checkpoint-action]');
    const separator = button?.closest('.aparte-checkpoint');
    if (!button || !separator || separator.parentElement !== this) return;
    switch (button.getAttribute('data-checkpoint-action')) {
      case 'toggle':
        this._checkpointOpen = !this._checkpointOpen;
        this._updateCheckpoint('toggle');
        break;
      case 'restore':
        this._confirmingRestore = true;
        this._updateCheckpoint('restore-confirm');
        break;
      case 'restore-cancel':
        this._confirmingRestore = false;
        this._updateCheckpoint('restore');
        break;
      case 'restore-confirm': {
        this._confirmingRestore = false;
        const messageId = this.getAttribute('message-id') ?? undefined;
        // Through the chat's own `updateMessage`, so the framework's list and the saved
        // conversation lose the checkpoints too — see restoreContext. This bubble is told
        // as well: a bubble with no transcript behind it (one placed by hand) has no
        // store to be told through, and would keep a separator for a summary nobody sends.
        restoreContext(this, { messageId, targetId: this._resolveTargetId() });
        this.setContextSummary(null);
        break;
      }
      case 'retry': {
        const targetId = this._resolveTargetId();
        const compactor = this._cfg.getCompactor();
        if (compactor) {
          // Through the compactor this chat resolves, so a Retry is a person's request, not the
          // policy's: it runs even when the policy has stopped trying on its own after two
          // failures, and it is told which chat by element, which an id cannot name inside a
          // shadow root. The compactor says how it went through the compaction events this
          // separator already listens to, so the result is not read here.
          void compactor.compact({ target: chatBoundaryOf(this), ...(targetId ? { targetId } : {}), force: true, reason: 'retry' });
        } else {
          // Nothing registered as the compactor: the command event is the way to ask, and
          // it is the one the gauge and a host's own button use.
          window.dispatchEvent(new CustomEvent<AparteCompactEventDetail>('aparte-compact', { detail: { targetId } }));
        }
        break;
      }
    }
  };

  /** Escape withdraws Restore's question, the way it closes every other inline prompt here. */
  private _onCheckpointKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this._confirmingRestore) return;
    const separator = (event.target as HTMLElement | null)?.closest?.('.aparte-checkpoint');
    if (!separator || separator.parentElement !== this) return;
    event.stopPropagation();
    this._confirmingRestore = false;
    this._updateCheckpoint('restore');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private _appendSegmentEl(segment: AparteSegment): void {
    if (!this._segmentsEl) {
        console.warn(`[AparteChatBubble] _appendSegmentEl ABORT: _segmentsEl is null`);
        return;
    }
    // The first segment of a message drawn piece by piece sets the count it is drawn with.
    if (this._segments.length === 1) this._drawnWithVersion = renderingVersionOf(this._cfg);
    const renderer = resolveSegmentRenderer(segment.type, this._cfg);
    if (renderer) {
      // Renderers are plain functions with no element to resolve from — expose
      // this bubble's config as the ambient render config for the duration.
      const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
      if (el) {
        this._segmentsEl.appendChild(el);
        this._install(segment, el, renderer);
      }
    } else {
      const el = unrenderedSegment(segment);
      this._segmentsEl.appendChild(el);
      this._install(segment, el, undefined);
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
    // Released while out of the page: what is left in the container is inert, and the redraw
    // on reconnect draws `_segments` as they are now. Patched here, a renderer could mount
    // into an element nothing tracks, which nothing would ever release.
    if (this._releasedWhileDetached) return;
    const renderer = resolveSegmentRenderer(segment.type, this._cfg);
    if (!renderer) return;

    // Drawn by another renderer than the one in effect now (one registered since, on this
    // config or on the global one it inherits): its `update` never drew this markup, so
    // the segment is drawn again by the current renderer instead of patched.
    const drawnBefore = this._drawn.get(segmentId);
    if (drawnBefore && drawnBefore.renderer !== renderer) {
      drawnBefore.segment = segment;
      this._redrawSegment(segment);
      return;
    }

    if (renderer.update) {
      runWithConfig(this._cfg, () => renderer.update!(el, segment));
      // A renderer may replace its own element in `update` (the tool row does when its
      // shape changes), cleaning up what it replaced: follow the element it left.
      const drawn = this._drawn.get(segmentId);
      if (drawn) {
        drawn.segment = segment;
        const now = this._segmentsEl?.querySelector(`:scope > [data-segment-id="${cssEscape(segmentId)}"]`) as HTMLElement | null;
        if (now && now !== drawn.el) {
          drawn.el = now;
          drawn.tool = segment.type === 'tool_call' ? toolRendererThatDrew(now) : null;
        }
      }
    } else {
      const newEl = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
      if (newEl) {
        this._release(segmentId);
        el.replaceWith(newEl);
        this._install(segment, newEl, renderer);
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
    this._drawnShell = shell ?? null;
    this._avatarFromProvider = false;   // a new frame, a new slot
    // The default frame's names are all the bubble's; a custom one's, only those stamped below.
    this._wroteRootLabel = this._wroteBarLabel = this._wroteArrowLabels = !shell;
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
              <button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-branch-prev" aria-label="${escapeAttr(this._cfg.getLocale().previousResponse ?? 'Previous response')}">${this._cfg.getIcon('prevBranch')}</button>
              <span class="aparte-branch-label">1 / 1</span>
              <!-- The move has to be ANNOUNCED. Pressing the arrows deliberately does not
                   take focus, so without a live region a screen-reader user gets the new
                   branch and no indication anything changed. The visible label cannot be
                   the region itself: a custom sibling-nav renderer may replace it with
                   dots, which reads as nothing. No new locale key — the position is
                   digits, and the buttons beside it already carry translated labels. -->
              <span class="aparte-sr-only aparte-branch-status" aria-live="polite"></span>
              <button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-branch-next" aria-label="${escapeAttr(this._cfg.getLocale().nextResponse ?? 'Next response')}">${this._cfg.getIcon('nextBranch')}</button>
            </div>
            <div class="aparte-action-bar" role="toolbar" aria-label="${escapeAttr(this._cfg.getLocale().messageActions ?? 'Message actions')}"></div>
          </div>
        </div>
      </div>
    `;
    }

    // The shell contract lists CLASS hooks, so a shell written from it carries no ARIA
    // and the transcript loses one article and one accessible name per custom bubble —
    // measured on this repo's own documented shell. Re-applied here rather than asked of
    // the author: a markup contract that also demanded a `role` fails the first time
    // somebody forgets one, silently (decision #8 — honoured end to end). A root that
    // already declares a `role` keeps it, which is how a shell overrides the default.
    const messageEl = this.querySelector('.aparte-message');
    if (messageEl && !messageEl.hasAttribute('role')) {
      messageEl.setAttribute('role', 'article');
      messageEl.setAttribute('aria-label', this._getAriaLabel());
      this._wroteRootLabel = true;
    }

    this._contentEl = this.querySelector('.aparte-content');
    this._segmentsEl = this.querySelector('.aparte-segments');
    this._attachmentsEl = this.querySelector('.aparte-attachments');
    this._actionBarEl = this.querySelector('.aparte-action-bar');
    // A custom shell's bar gets the roving tab stop below; it gets the toolbar it implies
    // too, as the root gets `article` above — the contract lists class hooks, so a shell
    // written from it carries no ARIA. A bar that declares its own role keeps it.
    if (this._actionBarEl && !this._actionBarEl.hasAttribute('role')) {
      this._actionBarEl.setAttribute('role', 'toolbar');
      if (!this._actionBarEl.hasAttribute('aria-label')) {
        this._actionBarEl.setAttribute('aria-label', this._cfg.getLocale().messageActions ?? 'Message actions');
        this._wroteBarLabel = true;
      }
    }
    // The branch arrows are icon buttons, and the contract asks no ARIA of a shell's author:
    // unnamed ones get the locale's names, and keep them through a language switch. A shell
    // that named either arrow keeps both as it wrote them — by an attribute, or by words in
    // the button, which a glyph like ‹ is not: a label stamped over a visible word is a name
    // the reader cannot see, and a voice command saying the word finds nothing.
    if (shell) {
      const prev = this.querySelector('.aparte-branch-prev');
      const next = this.querySelector('.aparte-branch-next');
      // Only words a reader can hear: an icon font's ligature or an SVG title under
      // `aria-hidden` is text in the DOM and no name at all.
      const audible = (arrow: Element): string => {
        let text = '';
        const walker = arrow.ownerDocument.createTreeWalker(arrow, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const hidden = node.parentElement?.closest('[aria-hidden="true"], [hidden]');
          if (!hidden || !arrow.contains(hidden)) text += node.textContent ?? '';
        }
        return text;
      };
      const named = (arrow: Element | null): boolean => !!arrow && (
        arrow.hasAttribute('aria-label') || arrow.hasAttribute('aria-labelledby') || arrow.hasAttribute('title')
        || /\p{L}/u.test(audible(arrow)));
      if ((prev || next) && !named(prev) && !named(next)) {
        const locale = this._cfg.getLocale();
        prev?.setAttribute('aria-label', locale.previousResponse ?? 'Previous response');
        next?.setAttribute('aria-label', locale.nextResponse ?? 'Next response');
        this._wroteArrowLabels = true;
      }
    }
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
    this._updateFinishNote();
    this._updateCheckpoint();
  }

  /**
   * Show the built-in waiting indicator while this bubble is in flight and has
   * nothing to show yet — the gap between "user sends" and the first token.
   *
   * The dots are CSS (no per-token work, themable, honours reduced-motion); the
   * accessible name is `locale.typing`, next to the `aria-busy` the streaming state
   * already sets. A custom bubble shell without the region simply has no indicator
   * (same null-guarded degradation as the other region hooks).
   */
  private _updateWaiting(): void {
    // A segment counts when it draws something: a call the app hides is in the message
    // but its row is an empty `hidden` placeholder, which is nothing for the reader.
    const shown = this._segmentsEl
      ? Array.from(this._segmentsEl.children).some((child) => !(child as HTMLElement).hidden)
      : this._segments.length > 0;
    const empty = !shown && !this._content.trim();
    // Between two steps: the last thing drawn is a call that has finished (or one the app
    // hides) and the next model turn has not written yet. The dots used to stop at the
    // first segment, so a long agent turn looked frozen after each "Done". Not while a
    // person is asked: nothing comes until they answer.
    const last = this._segments.at(-1);
    const lastEl = this._segmentsEl?.lastElementChild as HTMLElement | null | undefined;
    // A call waiting for approval is a person being asked — hidden or not, an empty reply
    // included: nothing comes until they answer.
    const asking = last?.type === 'tool_call' && (last as AparteToolCallSegment).status === 'awaiting-approval';
    const betweenSteps = last?.type === 'tool_call' && (isSegmentSettled(last) || lastEl?.hidden === true);
    const waiting = this._streaming && this._role !== 'user' && !asking && (empty || betweenSteps);

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
   * With no provider the slot keeps what the shell rendered — for the default shell,
   * nothing, hidden while empty — and loses what a provider drew there before. An empty
   * slot still shows when the stylesheet names a picture for its role
   * (`--aparte-avatar-image-user` / `-assistant`): see `_markAvatarImage`.
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
    if (!provider) {
      // `setAvatarProvider(null)`: what the provider drew goes with it. The slot returned
      // early here, so the old avatars stayed on every message already on screen.
      if (this._avatarFromProvider) {
        avatar.replaceChildren();
        this._avatarFromProvider = false;
      }
      this._markAvatarImage(avatar);
      return;
    }

    avatar.textContent = '';
    const cleanup = provider.render(this._role, avatar);
    this._avatarFromProvider = true;
    if (typeof cleanup === 'function') this._avatarCleanup = cleanup;
    // A provider may draw one role and leave the other's slot empty: the stylesheet's
    // picture still shows there.
    this._markAvatarImage(avatar);
  }

  /**
   * A picture from the stylesheet alone: an empty slot whose role's `--aparte-avatar-image-*`
   * names an image gets `data-image`, which lifts the rule that hides an empty slot. Hidden
   * while empty, the token painted nothing. Read when the message is drawn and on every
   * config change, in a batch with the other bubbles' (see `pendingAvatarMarks`).
   */
  private _markAvatarImage(avatar: HTMLElement): void {
    if (avatar.firstChild) {
      pendingAvatarMarks.delete(avatar);
      avatar.removeAttribute('data-image');
      return;
    }
    // Before the frame, with every other slot this task redraws: see `pendingAvatarMarks`.
    if (pendingAvatarMarks.size === 0) queueMicrotask(flushAvatarMarks);
    pendingAvatarMarks.set(avatar, { bubble: this, role: this._role });
  }

  private _updateRole(): void {
    const message = this.querySelector('.aparte-message');
    const avatar = this.querySelector('.aparte-avatar');
    const nameEl = this.querySelector('.aparte-name');

    if (message) {
      message.setAttribute('data-role', this._role);
      // The accessible name follows the role only on a root whose role the bubble wrote.
      // A shell that declares its own `role` overrides the default (the shell contract
      // says so), and an override that kept the role and lost the name would be half
      // of one.
      if (this._wroteRootLabel && message.getAttribute('role') === 'article') {
        message.setAttribute('aria-label', this._getAriaLabel());
      }
    }
    if (avatar) {
      avatar.setAttribute('data-role', this._role);
      // Refresh an initial that is ALREADY there; never create one — the default
      // shell renders this slot empty and the stylesheet hides it while it stays
      // empty. Same rule as `_updateName`, which is where it was actually costing
      // something; the reasoning is written out there.
      if (avatar.textContent && !this._avatarFromProvider) avatar.textContent = this._getAvatarInitial();
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
     * stylesheet hides it while it stays empty — `.aparte-avatar:empty:not(:where([data-image]))
     * { display: none }`, with the comment "No message avatar by default — the slot only shows
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
    // Not over what a provider drew either: with the provider just cleared, that DOM is
    // still there until `_renderAvatar` runs its cleanup and empties the slot.
    if (avatar && avatar.textContent && !this._cfg.getAvatarProvider() && !this._avatarFromProvider) {
      avatar.textContent = this._getAvatarInitial();
    }
    if (nameEl) nameEl.textContent = this._getDisplayName();
    // The accessible name follows the author too — on a root whose role the bubble wrote,
    // the same rule as `_updateRole`.
    const message = this.querySelector('.aparte-message');
    if (this._wroteRootLabel && message?.getAttribute('role') === 'article') message.setAttribute('aria-label', this._getAriaLabel());
  }

  private _updateContent(): void {
    if (!this._contentEl) return;

    // If we have segments, don't render simple content
    if (this._segments.length > 0) {
      this._contentEl.style.display = 'none';
      this._updateWaiting();
      return;
    }
    this._drawnWithVersion = renderingVersionOf(this._cfg);

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
    this._drawnWithVersion = renderingVersionOf(this._cfg);

    // Clear existing segments — their renderers clean up first.
    this._releaseAll();
    this._segmentsEl.innerHTML = '';

    for (const segment of this._segments) {
      const renderer = resolveSegmentRenderer(segment.type, this._cfg);
      if (renderer) {
        const el = segmentRenderResultToElement(runWithConfig(this._cfg, () => renderer.render(segment)), segment);
        if (el) {
          this._segmentsEl.appendChild(el);
          this._install(segment, el, renderer);
        }
      } else {
        const el = unrenderedSegment(segment);
        this._segmentsEl.appendChild(el);
        this._install(segment, el, undefined);
      }
    }

    // Hide simple content when segments are present
    if (this._contentEl) {
      this._contentEl.style.display = this._segments.length > 0 ? 'none' : '';
    }
    this._reflectError();
    this._syncCopyAction();
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

  /**
   * Named after its author when it has one: a `name` on the bubble is who wrote it (a human
   * agent answering on the assistant's side, a second assistant), and naming every one of
   * them "Assistant response" told a screen-reader user the opposite of what the page shows.
   * Without a name, the role names it.
   */
  private _getAriaLabel(): string {
    const locale = this._cfg.getLocale();
    const name = this.getAttribute('name');
    if (name) return (locale.messageFrom || 'Message from {name}').replace('{name}', () => name);
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
      if (a.type.startsWith('image/') && this._isShowableUrl(a.url)) {
        // `aparte-thumbnail` is the RECIPE (the box, the size, the ground); `aparte-thumb`
        // only maps the strip's measurements onto it. The bubble emitted the mapping
        // without the recipe, so its tiles had no box — a bare "PDF" beside a bare image.
        return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--image" title="${name}">`
          + `<img class="aparte-thumbnail__image" src="${escapeHtml(a.url)}" alt="${name}" loading="lazy" />`
          + `<span class="aparte-thumb__name">${name}</span></div>`;
      }
      return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--file" title="${name}">`
        + `<span class="aparte-thumbnail__label">${escapeHtml(this._fileExt(a.name))}</span>`
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
        const img = tile.querySelector('.aparte-thumbnail__image') as HTMLImageElement | null;
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
  /**
   * The same answer `copyAttributes` gives before it writes an `src`, plus `blob:`.
   *
   * An attachment's `url` is documented as "URL or data URI" and a storage adapter
   * re-mints it when a conversation is restored, so it is the app's value, not the
   * composer's — and, like every other URL core emits, it is asked whether its SCHEME
   * is allowed at all. A picture whose URL is refused is not half-rendered: it falls
   * back to the file chip, which still names the file.
   *
   * `blob:` is added because it is the shape core itself mints — `filesToAttachments`
   * calls `URL.createObjectURL`, and `AparteMessage.attachments` documents the same
   * on hydration. `isSafeUrl` refuses it, and rightly: that list governs MODEL
   * markup, which has no way to make a blob URL resolve.
   */
  private _isShowableUrl(url: string | undefined): boolean {
    if (!url) return false;
    return isSafeUrl(url, 'img') || /^blob:/i.test(url.trim());
  }

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
   * The listener lives on the host, which is never replaced, and `closest()` finds
   * whichever button exists at the moment of the click — so a click that lands while
   * a re-render is swapping the buttons is not lost.
   *
   * Bound in `connectedCallback` and removed in `disconnectedCallback` as a stable
   * field, so a re-connect never stacks listeners.
   */
  private _onBranchPickerClick = (event: Event): void => {
    // `aparte-branch-navigate` is dispatched from this arrow field, which the manifest
    // analyser (methods only) does not visit: it is declared by hand in the class `@fires`.
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
   * confirmation, an embedded view — without intercepting the DOM. With
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

  /**
   * What the copy action copies: the reply, not the reasoning. A `thinking` segment is
   * the model's scratchpad, and the client already keeps it out of the history it sends
   * back (`segmentsToWireText`) for the same reason — copying it along with the answer
   * pasted a paragraph of deliberation above every reply, which no assistant on the
   * market does. Segments with no `content` (a tool call) contribute nothing, so a
   * turn made only of those copies as `''` — and the action bar reads this to decide
   * whether to offer the button at all.
   */
  private _copyableText(): string {
    return (this._content || this._segments
      .filter(s => s.type !== 'thinking')
      .map(s => (s as { content?: string }).content ?? '')
      .join('\n')).trim();
  }

  /**
   * The copy button is for text. `hidden` rather than removed: the bar is rebuilt
   * rarely and the text changes on every streamed token, so the button is toggled in
   * place from each path that changes what a copy would paste.
   */
  private _syncCopyAction(): void {
    const btn = this._actionBarEl?.querySelector<HTMLElement>('.aparte-action-copy');
    if (btn) btn.hidden = this._copyableText() === '';
  }

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
        // info all need a host or a listener to mean anything. (Copy is rendered here
        // and HIDDEN by `_syncCopyAction` while there is no text to copy — a tool-only
        // turn used to offer a button that copied the empty string and said "Copied".)
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
    this._syncCopyAction();

    // Custom actions registered via aparteGlobalConfig.registerAction — appended
    // after the built-ins, built as DOM (label goes to attributes, never
    // interpolated into innerHTML) so a consumer label can't inject markup.
    this._appendCustomActions();
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
   * A toolbar is ONE tab stop whose members are reached with the arrow keys — that is
   * the whole of what the role means to a screen-reader user. Without it, tabbing
   * through a long transcript would walk every button of every message.
   *
   * The roving index is re-applied from `_syncFooterVisibility`, which is the single
   * funnel all three build paths run through (the flag-driven bar, the edit bar, and
   * the branch picker's own visibility pass). Re-deriving it there rather than in each
   * builder keeps the invariant true after a `setBubbleActions` rebuild.
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
   * An empty action bar is not a bar: with every action off it would be a
   * `role="toolbar"` with nothing in it (announced as such) that still reserves its
   * fixed height plus the footer's under every bubble. So both follow their
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
  private _appendCustomActions(): void {
    if (!this._actionBarEl) return;
    for (const a of this._cfg.getActions('bubble')) {
      const roles = a.bubble?.roles ?? ['user', 'assistant'];
      if (!roles.includes(this._role)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-custom';
      btn.dataset['action'] = `custom:${a.id}`;
      // aria-label/title via setAttribute — safe for consumer-provided strings.
      btn.setAttribute('aria-label', a.label);
      btn.setAttribute('title', a.label);
      // Icon: raw inline SVG/HTML, else an icon-provider key (trusted output).
      btn.innerHTML = a.icon.startsWith('<')
        ? a.icon
        : (this._cfg.getIcon(a.icon) ?? a.iconFallback ?? '');
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
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-copy" data-action="copy" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.copy()}</button>`;
      }
      case 'edit': {
        const l = locale.edit ?? 'Edit message';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-edit" data-action="edit" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.edit()}</button>`;
      }
      case 'retry': {
        const l = locale.retry ?? 'Retry';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-retry" data-action="retry" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.retry()}</button>`;
      }
      case 'thumbUp': {
        const l = locale.feedbackPositive ?? 'Good response';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-feedback-pos" data-action="feedback-positive" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbUp()}</button>`;
      }
      case 'thumbDown': {
        const l = locale.feedbackNegative ?? 'Bad response';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-feedback-neg" data-action="feedback-negative" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${icons.thumbDown()}</button>`;
      }
      case 'info': {
        // Only when there are numbers to show: a details button over nothing is a
        // dead button. The popover itself is the app's (see `aparte-message-info`).
        if (!this._usage) return '';
        const l = locale.messageInfo ?? 'Details';
        return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-action-btn aparte-action-info" data-action="info" aria-label="${escapeAttr(l)}" title="${escapeAttr(l)}">${this._cfg.getIcon('info')}</button>`;
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
        const text = this._copyableText();
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
    // Read the opener BEFORE the action bar is rebuilt — after it, the button is gone.
    // Nothing is remembered when the focus is outside this bubble: pulling it back from
    // wherever the reader actually is would be theft, not a restore.
    const opener = document.activeElement;
    this._editReturnAction =
      opener instanceof HTMLElement && this.contains(opener)
        ? (opener.getAttribute('data-action') ?? 'edit')
        : null;
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
    // A frame change that arrived while the editor was open is drawn now.
    this._redrawFrameIfChanged();
    this._redrawIfStale();
    this._updateActionBar();

    // Both exits destroy the focused element — the editor is removed and the bar is
    // rebuilt — so without this the keyboard lands on `<body>` and the next Tab
    // restarts at the top of the page. Matched by attribute rather than by selector:
    // a custom action's id (`custom:…`) is a consumer string.
    const returnTo = this._editReturnAction;
    this._editReturnAction = null;
    if (returnTo && this._actionBarEl) {
      const back = Array.from(this._actionBarEl.querySelectorAll<HTMLButtonElement>('[data-action]'))
        .find((btn) => btn.getAttribute('data-action') === returnTo);
      // The remembered action can come back DISABLED (the reader sent from the composer
      // mid-edit, so the transcript is busy) or gone (it was turned off while editing).
      // `focus()` on a disabled button is a no-op, which drops the reader on `<body>` —
      // the very bug this restore exists for, silently. So fall back to the bar's first
      // enabled button.
      const target = back && !back.disabled
        ? back
        : this._actionBarEl.querySelector<HTMLButtonElement>('button:not([disabled])');
      // The bar is one tab stop that the arrows move (`_onActionBarKeydown`), and
      // `_updateActionBar` just parked it on the first button. Focusing without moving
      // the stop leaves the reader on a `tabindex="-1"` member of a `role="toolbar"`:
      // Shift+Tab out and Tab back returns them to copy, not to where they were.
      if (target) {
        for (const button of this._rovingButtons()) button.tabIndex = button === target ? 0 : -1;
        target.focus();
      }
    }

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
    this._updateFinishNote();
    /*
     * Streaming just finished — the SETTLE pass.
     *
     * `_updateContent` is what runs it: on `isStreaming === false`
     * `writeStreamedMarkdown` flushes the incremental parser and then either
     * re-renders once through the one-shot provider, whose output goes through
     * `sanitizeHtml`, or — when no one-shot provider is registered — re-sanitises
     * the flushed DOM in place. Either way the settled message is what
     * `sanitizeHtml` produced, which is the reason the streaming provider is
     * allowed to write DOM directly — and this branch never called it, so a streamed
     * `<code class="aparte-btn">` was permanent rather than transient. The live
     * end-of-turn call carries no content (`completeMessage` sends
     * `{ status: 'completed' }` alone), so re-applying `_content` here is the only
     * place it can happen.
     *
     * It also highlights on its way out (it is no longer streaming), which is what
     * this line used to do on its own. A segment-bearing bubble is a no-op there —
     * the content element is hidden and empty — which is what it was for the
     * highlight too.
     */
    if (wasStreaming && !streaming) this._updateContent();
    // Segments have no such pass: if a Markdown or highlight provider arrived while they
    // streamed, the finished message is drawn again with it — segment by segment, keeping
    // the cards a mounted renderer holds (it checks the version itself).
    if (wasStreaming && !streaming && this._segments.length > 0) this._redrawIfStale();
  }
}

// Register the custom element
deferHydrationOf(AparteChatBubble);
if (!customElements.get('aparte-chat-bubble')) {
  customElements.define('aparte-chat-bubble', AparteChatBubble);
}
