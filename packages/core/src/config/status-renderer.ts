/**
 * Status Renderer
 *
 * Replace the typing indicator's inner markup — the default is an assistant
 * avatar slot + animated dots + optional text. Return an HTML **string** or a
 * ready **HTMLElement** (charter §6 render hooks: `string | HTMLElement`). The
 * `<aparte-chat-status>` container keeps owning show/hide (via the `visible`
 * attribute) and the accessible name, so you supply only the visual.
 *
 * @example
 * // A custom spinner, driven by the typing text.
 * AparteConfig.setStatusRenderer((text) => {
 *   const el = document.createElement('div');
 *   el.className = 'my-typing';
 *   el.textContent = text;
 *   return el;
 * });
 *
 * @param text - The typing text (from the `text` attribute, default "Typing").
 * @returns HTML string or a DOM element to place inside the status container.
 */
export type AparteStatusRenderer = (text: string) => string | HTMLElement;
