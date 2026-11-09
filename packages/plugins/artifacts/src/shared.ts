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


/**
 * Take off a code fence a model put AROUND a document (``` or ~~~, optional language tag),
 * and whatever follows its closing fence: small models frequently repeat lines there.
 *
 * Only a fence that opens the document counts, since one further down is the document's
 * own. A Markdown document can also open on a code block of its own, so it is unwrapped only
 * when its fence says it holds Markdown; `kind` is the artifact's short kind.
 *
 * Char-based scanner — no regex.
 */
export function stripCodeFences(content: string, kind?: string): string {
    const firstLineEnd = lineEnd(content, 0);
    const opener = content.startsWith('```') || content.startsWith('~~~') ? readFence(content, 0, firstLineEnd) : null;
    if (!opener) return content.trim();
    if (kind === 'markdown' && opener.info !== 'markdown' && opener.info !== 'md') return content.trim();

    const body = content.slice(firstLineEnd + 1);
    const closeAt = findClosingFence(body, opener);
    return (closeAt === -1 ? body : body.slice(0, closeAt)).trim();
}

interface Fence {
    char: string;
    run: number;
    /** What follows the fence on its line, lower-cased: the language tag. */
    info: string;
}

function lineEnd(s: string, from: number): number {
    const at = s.indexOf('\n', from);
    return at === -1 ? s.length : at;
}

/** The fence on the line `[start, end)`, or `null` when the line is not one. */
function readFence(s: string, start: number, end: number): Fence | null {
    let i = start;
    while (i < end && (s[i] === ' ' || s[i] === '\t')) i++;
    const char = s[i];
    if (i >= end || (char !== '`' && char !== '~')) return null;
    const from = i;
    while (i < end && s[i] === char) i++;
    if (i - from < 3) return null;
    const info = s.slice(i, end).trim().toLowerCase();
    // A backtick fence's tag holds no backtick: that is what tells it from inline code.
    if (char === '`' && info.includes('`')) return null;
    return { char, run: i - from, info };
}

/**
 * Where the line closing `opener` begins, or -1 if none. It takes the opener's character and
 * at least its length. A tagged fence inside opens a block of the document's, and the next
 * bare fence closes that block rather than the document.
 */
function findClosingFence(s: string, opener: Fence): number {
    let nested = 0;
    for (let start = 0; start < s.length; start = lineEnd(s, start) + 1) {
        const fence = readFence(s, start, lineEnd(s, start));
        if (!fence || fence.char !== opener.char) continue;
        if (fence.info) nested++;
        else if (nested > 0) nested--;
        else if (fence.run >= opener.run) return start;
    }
    return -1;
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

