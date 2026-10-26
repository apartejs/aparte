/**
 * Error Renderer
 *
 * Replace the content of an error bubble — the default is an icon + "Error" title + the
 * sentence the error's code reads as, in the reader's language (or the error's own words
 * when it keeps them) + details. Return an HTML **string** or a ready **HTMLElement**
 * (charter §6 render hooks: `string | HTMLElement`), e.g. that sentence with your own
 * "Try again" button. This drives the built-in `error` segment renderer, so it's the one
 * place to customize error UI (rather than registering a segment renderer for the `error`
 * type yourself). The card you return is yours: a language switch does not rewrite it. The
 * bubble also reflects `data-error` on its `.aparte-message` while an error segment is
 * present, for CSS theming.
 *
 * @example
 * aparteGlobalConfig.setErrorRenderer(({ sentence, message }) => {
 *   const el = document.createElement('div');
 *   el.className = 'my-error';
 *   el.textContent = `${sentence ?? message} — status.example.com`;
 *   return el;
 * });
 */
export type AparteErrorRenderer = (ctx: {
    /**
     * The error's own message (the error segment's content): a transport's or a provider's
     * text, written for a developer, or the words of an error that keeps them.
     */
    message: string;
    /**
     * What the default card shows in place of `message`: one sentence chosen by the code,
     * in the locale in force. Absent for an error that keeps its own words (the turn limit,
     * a setup error, an app's own code).
     */
    sentence?: string;
    /** Text an app chose to show under the message (the error segment's `details`). */
    details?: string;
    /** The machine-readable code (the error segment's `code`), e.g. `MAX_TURNS_EXCEEDED`. */
    code?: string;
}) => string | HTMLElement;
