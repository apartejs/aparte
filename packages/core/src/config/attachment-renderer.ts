import type { AparteAttachment } from '../types/models.js';

/**
 * Attachment Renderer
 *
 * Replace the chip rendered for each attachment on a user message — the default
 * is an image thumbnail or a file chip (extension + name). Return an HTML
 * **string** or a ready **HTMLElement** (charter §6 render hooks:
 * `string | HTMLElement`), e.g. a PDF page preview, an audio player, or a richer
 * card. Called once per attachment.
 *
 * When you provide a renderer you own the markup AND the interactions: the
 * built-in image-tile click that dispatches `aparte:attachment-preview` is NOT
 * wired for custom output — dispatch it yourself (bubbles, composed) or handle
 * clicks your own way.
 *
 * @example
 * AparteConfig.setAttachmentRenderer((att) => {
 *   if (att.type === 'application/pdf') {
 *     const el = document.createElement('div');
 *     el.className = 'my-pdf-chip';
 *     el.textContent = att.name;
 *     return el;
 *   }
 *   return `<div class="my-file">${att.name}</div>`;
 * });
 */
export type AparteAttachmentRenderer = (attachment: AparteAttachment) => string | HTMLElement;
