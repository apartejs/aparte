/**
 * Replies an answer offers, written as text: a ```suggestions block of JSON in a reply,
 * for a backend that only sends text (an n8n workflow, a plain completion), the way
 * `@aparte/plugin-cards` reads a ```card-<name> block. Nothing of it shows in the
 * message: `<aparte-suggestions answers>` above the composer shows the replies of the last
 * answer, and a click sends one as if typed.
 *
 *   Which day suits you?
 *   ```suggestions
 *   ["Tuesday 3", "Wednesday 4", {"label": "Another week", "prompt": "Next week, please"}]
 *   ```
 *
 * One more user of `registerCodeLanguageRenderer`, the seam a block's language goes
 * through: no system of its own.
 */
import { aparteGlobalConfig, type AparteConfig } from '../../config/index.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';

/** The language the block is written in. */
export const SUGGESTIONS_BLOCK_LANGUAGE = 'suggestions';

/** The replies a block holds, or `null` when it is not an array of replies. */
function readReplies(source: string): Array<string | { label: string; prompt?: string }> | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const replies = parsed.filter((r): r is string | { label: string; prompt?: string } =>
        (typeof r === 'string' && r.trim() !== '')
        || (typeof r === 'object' && r !== null && typeof (r as { label?: unknown }).label === 'string'));
    return replies.length ? replies : null;
}

/**
 * Read the code blocks in language `suggestions` in replies as the replies that
 * `<aparte-suggestions answers>` offers. Returns the function that stops it. Off until called: a block is then no longer
 * shown as code, so it is the app's choice.
 *
 * @example
 * setupSuggestionBlocks();
 * // and, in the composer, an `<aparte-suggestions answers>` element
 */
export function setupSuggestionBlocks(config: AparteConfig = aparteGlobalConfig): () => void {
    return config.registerCodeLanguageRenderer({
        languages: [SUGGESTIONS_BLOCK_LANGUAGE],
        // Not code to its reader, and not shown at all: no card around it.
        bare: true,
        render: ({ source, open }) => {
            // The replies arrive whole: nothing while the block is still being written.
            if (open) return '';
            const replies = readReplies(source);
            if (!replies) return `<code class="aparte-code-error">${escapeHtml(source)}</code>`;
            return `<span class="aparte-suggestions-mark" hidden data-aparte-suggestions="${escapeAttr(JSON.stringify(replies))}"></span>`;
        },
    });
}
