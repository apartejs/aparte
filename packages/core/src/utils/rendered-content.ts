/**
 * Where model-written markup lives inside a chat.
 *
 * The sanitizer refuses the attributes core reads as commands, and these are the
 * places a delegated listener or a lookup double-checks anyway: a click that started
 * inside a reply is the model's click target, not a control the app placed. The
 * summary panel of a compaction checkpoint holds Markdown the model wrote too, though
 * it sits beside the message rather than in it.
 *
 * A control an app mounts INSIDE a segment (a card's button, a tool renderer's) does
 * not use the attributes this guards: those are wired by the renderer that drew them.
 *
 * Internal: not exported from the package barrel.
 */
const RENDERED_CONTENT = '.aparte-message-content, .aparte-segments, .aparte-content, .aparte-checkpoint__summary';

/** True when `el` is inside the rendered body of a message (or a checkpoint's summary). */
export function inRenderedContent(el: Element | null | undefined): boolean {
    return !!el?.closest?.(RENDERED_CONTENT);
}
