/**
 * Bubble-Shell Renderer (advanced)
 *
 * Replace the *structural skeleton* of `<aparte-chat-bubble>` — the markup the
 * bubble renders once and then populates — while keeping all of its behavior
 * (segments, streaming, action bar, avatar, branch picker). This is the
 * whole-structure override that {@link https://…} `renderBubble` (wrapper-level,
 * replaces the element entirely) is not: here the native bubble stays in charge.
 *
 * Return an HTML **string** or a ready **HTMLElement** (charter §6:
 * `string | HTMLElement`). Because the bubble queries known class hooks after
 * rendering the shell, your shell MUST honor this contract:
 *
 * - Root element **must** be `.aparte-message` (it carries `data-role` and receives
 *   `data-streaming` / `data-error`; the styles target it).
 * - Include the region hooks you want the bubble to populate. Any you omit simply
 *   stay empty (every lookup is null-guarded — graceful degradation):
 *   - `.aparte-avatar`         — filled by the avatar provider / initial
 *   - `.aparte-name`           — the display name (you set it from `ctx.name`)
 *   - `.aparte-timestamp`      — the formatted time
 *   - `.aparte-attachments`    — user-message attachment chips
 *   - `.aparte-segments`       — streamed/structured segments
 *   - `.aparte-content`        — simple markdown content
 *   - `.aparte-action-bar`     — copy/retry/edit/… + custom actions
 *   - `.aparte-branch-picker`  — with `.aparte-branch-prev` / `.aparte-branch-label` /
 *                              `.aparte-branch-next` for sibling navigation
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
