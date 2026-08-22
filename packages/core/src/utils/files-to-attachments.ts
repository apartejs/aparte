import type { AparteAttachment } from '../types/models.js';
import { uuid } from './uuid.js';



/**
 * Turn the `File[]` an `aparte-send` event carries into the
 * {@link AparteAttachment}[] a message renders.
 *
 * The composer hands you raw `File`s; a bubble needs an id, a MIME type and a
 * `url` to show a chip or a thumbnail. The `ConversationController` (used by the
 * framework wrappers) does this internally — this is the same conversion,
 * exported so a raw-core consumer driving `appendMessage()` itself doesn't have
 * to hand-roll object URLs:
 *
 * ```ts
 * chat.addEventListener('aparte-send', (e) => {
 *   const { content, files } = e.detail;
 *   chat.viewport?.appendMessage({
 *     id: uuid(), role: 'user', content, timestamp: Date.now(),
 *     ...(files?.length ? { attachments: filesToAttachments(files) } : {}),
 *   });
 * });
 * ```
 *
 * The `url` comes from `URL.createObjectURL`, so it lives as long as the
 * document; the raw `File` rides along on `blob` for storage adapters that
 * persist attachments and rebuild the url on reload.
 *
 * That lifetime is deliberate for a rendered attachment — but it is also a leak
 * once the attachment is gone: a long session that sends many files retains every
 * `File` for the life of the page. Call {@link revokeAttachmentUrls} when you know
 * they are no longer rendered; core does it on `clearAll()`.
 */
export function filesToAttachments(files: readonly File[]): AparteAttachment[] {
    return files.map((file) => ({
        id: uuid(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
        size: file.size,
        blob: file,
    }));
}

/**
 * Release the object URLs of attachments that are no longer on screen.
 *
 * Nothing revoked them, so every `File` a session sent stayed reachable until the
 * page went away. Only the caller knows when an attachment stops being rendered —
 * a persisted conversation may re-render one much later — so this is a function
 * rather than something `filesToAttachments` could schedule.
 *
 * Safe to call twice: revoking an already-revoked or foreign URL is a no-op, and a
 * `blob` is left in place so a storage adapter can still rebuild the url.
 */
export function revokeAttachmentUrls(attachments: readonly AparteAttachment[] | undefined): void {
    if (!attachments?.length) return;
    if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    for (const attachment of attachments) {
        if (attachment.url?.startsWith('blob:')) URL.revokeObjectURL(attachment.url);
    }
}
