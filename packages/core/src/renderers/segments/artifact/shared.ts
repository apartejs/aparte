/**
 * The leaves the artifact card and the binary-file path BOTH use.
 *
 * Scoped by a call-site census, not by intuition. The obvious-looking candidates are
 * not here: `BINARY_FILE_KINDS` reads as shared and is used only by the card (which
 * consults it to delegate), `PREVIEWABLE_KINDS`, `languageForKind` and
 * `downloadTextArtifact` are card-only, and `FILE_ICON_LABEL` and `formatBytes` are
 * binary-only. A first draft of this module took all of them and would have been a
 * grab-bag named for one of its three jobs.
 *
 * What is genuinely shared is small: fence stripping (which the plain code renderer
 * needs too), the kind→label map, and the throttle pair behind the debounced
 * re-highlight.
 */
import { contextConfig } from '../../../config/index.js';


/**
 * Strip leading/trailing markdown code fences (``` or ~~~, optional lang tag).
 * Also strips any content that appears after the closing fence (small models
 * frequently duplicate lines after the closing ``` block).
 *
 * Char-based scanner — no regex.
 */
export function stripCodeFences(content: string): string {
    let s = content;

    // Opening fence: leading ``` or ~~~ (3+) optionally followed by language tag,
    // then a newline. Walk the start of the string only.
    if (s.startsWith('```') || s.startsWith('~~~')) {
        const fenceChar = s[0];
        let i = 0;
        while (i < s.length && s[i] === fenceChar) i++;
        // Skip language tag chars (anything until newline)
        while (i < s.length && s[i] !== '\n') i++;
        // Skip the newline itself if present
        if (i < s.length && s[i] === '\n') i++;
        s = s.slice(i);
    }

    // Closing fence: scan forward to find a line that is exclusively `````/`~~~`+
    // optionally followed by trailing whitespace; cut there + everything after.
    const closeAt = findClosingFence(s);
    if (closeAt !== -1) s = s.slice(0, closeAt);

    return s.trim();
}

/** Find the byte offset where a closing fence line begins, or -1 if none. */
function findClosingFence(s: string): number {
    let i = 0;
    while (i < s.length) {
        // Find start of next line
        const lineStart = i;
        // Skip leading whitespace on this line (indentation)
        let k = lineStart;
        while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++;
        if (k < s.length && (s[k] === '`' || s[k] === '~')) {
            const fenceChar = s[k];
            let runs = 0;
            while (k < s.length && s[k] === fenceChar) { runs++; k++; }
            if (runs >= 3) {
                // The rest of the line should be whitespace only — otherwise
                // it's not a closing fence (e.g. inline backtick text).
                let onlyWs = true;
                while (k < s.length && s[k] !== '\n') {
                    if (s[k] !== ' ' && s[k] !== '\t' && s[k] !== '\r') { onlyWs = false; break; }
                    k++;
                }
                if (onlyWs) {
                    // Cut at start of this line; if a `\n` precedes, drop it too
                    let cut = lineStart;
                    if (cut > 0 && s[cut - 1] === '\n') cut--;
                    return cut;
                }
            }
        }
        // Advance to next line
        while (i < s.length && s[i] !== '\n') i++;
        if (i < s.length) i++;
    }
    return -1;
}

/**
 * Debounced syntax-highlight during streaming. Re-running Shiki on every
 * token chunk would saturate the main thread (50-100ms/highlight × 10
 * chunks/sec). We coalesce to one highlight every ~400ms, plus a final
 * highlight at stream-end (handled by the caller).
 */
const _lastHighlightAt = new Map<string, number>();

export function markThrottle(map: Map<string, number>, id: string, at: number): void {
    map.delete(id);
    if (map.size >= MAX_THROTTLE_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
    map.set(id, at);
}

export function debounceHighlight(
    element: HTMLElement,
    paneSelector: string,
    content: string,
    lang: string,
    segId: string,
): void {
    const now = Date.now();
    const last = _lastHighlightAt.get(segId) ?? 0;
    if (now - last < HIGHLIGHT_DEBOUNCE_MS) return;
    markThrottle(_lastHighlightAt, segId, now);
    // May run from a window-event callback (late) — resolve from the element.
    void contextConfig(element).highlightCode(content, lang).then(html => {
        const wrapper = element.querySelector<HTMLElement>(paneSelector);
        if (wrapper) wrapper.innerHTML = html;
    }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
}

export function labelForKind(kind: string): string {
    switch (kind) {
        case 'react': return 'React component';
        case 'html': return 'HTML document';
        case 'svg': return 'SVG image';
        case 'js': return 'JavaScript snippet';
        case 'css': return 'CSS stylesheet';
        case 'json': return 'JSON document';
        case 'markdown': return 'Markdown document';
        case 'csv': return 'CSV table';
        case 'text': return 'Text file';
        case 'python': return 'Python script';
        case 'typescript': return 'TypeScript file';
        case 'bash': return 'Bash script';
        case 'sql': return 'SQL query';
        case 'pdf': return 'PDF generator';
        case 'xlsx': return 'Excel generator';
        case 'docx': return 'Word generator';
        default: return 'Artifact';
    }
}

/** Cap a segmentId→timestamp throttle map so a long session can't grow it without
 *  bound (one entry per streamed segment). Values are timestamps (tiny), so the cap
 *  is generous; delete-then-set refreshes recency, evict the oldest key when full.
 *  Evicting a stale entry costs at most one extra highlight/dispatch — never
 *  incorrect, since both debounce windows are far shorter than the cap horizon. */
const MAX_THROTTLE_ENTRIES = 256;

const HIGHLIGHT_DEBOUNCE_MS = 400;
