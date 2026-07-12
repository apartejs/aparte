/**
 * Error Renderer
 *
 * Replace the content of an error bubble — the default is an icon + "Error" title
 * + message (+ details). Return an HTML **string** or a ready **HTMLElement**
 * (charter §6 render hooks: `string | HTMLElement`), e.g. a friendly message with
 * your own "Try again" button. This drives the built-in `error` segment renderer,
 * so it's the one place to customize error UI (rather than registering a segment
 * renderer for the `error` type yourself). The bubble also reflects `data-error`
 * on its `.aparte-message` while an error segment is present, for CSS theming.
 *
 * @example
 * AparteConfig.setErrorRenderer(({ message }) => {
 *   const el = document.createElement('div');
 *   el.className = 'my-error';
 *   el.textContent = `Something went wrong: ${message}`;
 *   return el;
 * });
 */
export type AparteErrorRenderer = (ctx: {
    /** Human-readable error message (the error segment's content). */
    message: string;
    /** Optional error code/details (the error segment's `details`). */
    details?: string;
}) => string | HTMLElement;
