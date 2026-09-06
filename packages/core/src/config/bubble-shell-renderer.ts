/**
 * Bubble-Shell Renderer (advanced)
 *
 * Replace the *structural skeleton* of `<aparte-chat-bubble>` — the markup the
 * bubble renders once and then populates — while keeping all of its behavior
 * (segments, streaming, action bar, avatar, branch picker). This is the
 * whole-structure override that `renderBubble` (wrapper-level,
 * replaces the element entirely) is not: here the native bubble stays in charge.
 *
 * Return an HTML **string** or a ready **HTMLElement** (charter §6:
 * `string | HTMLElement`). Because the bubble queries known class hooks after
 * rendering the shell, your shell MUST honor this contract:
 *
 * - Root element **must** be `.aparte-message` (it carries `data-role` and receives
 *   `data-streaming` / `data-error`; the styles target it).
 * - Include the region hooks you want the bubble to populate, in the order the default
 *   shell renders them. Any you omit simply stay empty (every lookup is null-guarded —
 *   graceful degradation):
 *   - `.aparte-avatar`          — filled by the avatar provider / initial
 *   - `.aparte-name`            — the display name (you set it from `ctx.name`)
 *   - `.aparte-timestamp`       — the formatted time
 *   - `.aparte-attachments`     — user-message attachment chips
 *   - `.aparte-message-content` — the painted content box, and it HOLDS the next three
 *                               (`.aparte-segments`, `.aparte-content`, `.aparte-waiting`):
 *                               the background, the radius and the padding of a user
 *                               message are declared on this box, so rendering the three
 *                               as its siblings leaves a message with no bubble — every
 *                               behaviour intact, the look gone. The bubble hides the box
 *                               when the turn has nothing to show, so an attachments-only
 *                               message does not draw an empty coloured rectangle
 *   - `.aparte-segments`        — streamed/structured segments
 *   - `.aparte-content`         — simple markdown content
 *   - `.aparte-waiting`         — the dots between "user sends" and the first token; put
 *                               a `.aparte-sr-only` span inside it for the label the
 *                               screen reader hears
 *   - `.aparte-footer`          — the row that holds the branch picker and the actions
 *   - `.aparte-branch-picker`   — with `.aparte-branch-prev` / `.aparte-branch-label` /
 *                               `.aparte-branch-next` for sibling navigation, and
 *                               `.aparte-branch-status` (a `.aparte-sr-only` span with
 *                               `aria-live="polite"`) for the announcement
 *   - `.aparte-action-bar`      — copy/retry/edit/… + custom actions
 *
 * Omitting most of these costs you something you can see. **The two that fail silently
 * are `.aparte-waiting` and `.aparte-branch-status`**: without the first there is no
 * "thinking" state at all while the model composes, and without the second a
 * screen-reader user gets no word that the branch moved — the arrows deliberately do
 * not take focus, so nothing else announces it.
 *
 * Two more classes carry the DEFAULT LAYOUT and nothing else — the bubble never queries
 * them, so a shell that lays itself out differently is free to drop both: `.aparte-body`
 * (the column beside the avatar, and the containing block the footer floats in) and
 * `.aparte-header` (the name and time row). Keep them and the default stylesheet lays
 * your shell out like the native bubble.
 *
 * Prefer `renderBubble` (wrapper) when you want a fully custom element; use this
 * when you want to keep the native bubble's machinery but reshape its layout.
 *
 * @param ctx.role          - 'user' | 'assistant'.
 * @param ctx.name          - Display name for the header.
 * @param ctx.avatarInitial - Default one-letter avatar fallback.
 * @returns HTML string or a DOM element whose root is `.aparte-message`.
 */
export type AparteBubbleShellRenderer = (ctx: {
    role: 'user' | 'assistant';
    name: string;
    avatarInitial: string;
}) => string | HTMLElement;
