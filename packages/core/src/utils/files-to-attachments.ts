import type { AparteAttachment } from '../types/models.js';

/** `crypto.randomUUID` where available, with a deterministic-enough fallback. */
function attachmentId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
 *     id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now(),
 *     ...(files?.length ? { attachments: filesToAttachments(files) } : {}),
 *   });
 * });
 * ```
 *
 * The `url` comes from `URL.createObjectURL`, so it lives as long as the
 * document; the raw `File` rides along on `blob` for storage adapters that
 * persist attachments and rebuild the url on reload.
 */
export function filesToAttachments(files: readonly File[]): AparteAttachment[] {
    return files.map((file) => ({
        id: attachmentId(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
        size: file.size,
        blob: file,
    }));
}
