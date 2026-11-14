/**
 * The shape of a change, shared by the computation (`diffTexts`, `parseUnifiedDiff`), the
 * element and the setup. Plain data: no DOM, so a server can build it and send it as JSON.
 */

/** What a line of a hunk is: unchanged, added, or removed. */
export type AparteDiffLineKind = 'context' | 'add' | 'del';

/** One line of a hunk. */
export interface AparteDiffLine {
    kind: AparteDiffLineKind;
    /** The line's text, without its `+` / `-` / space marker and without its line ending. */
    text: string;
    /** Its number in the old file: on a removed or an unchanged line. */
    oldLine?: number;
    /** Its number in the new file: on an added or an unchanged line. */
    newLine?: number;
    /** The file ends on this line without a newline (`\ No newline at end of file`). */
    noNewline?: boolean;
}

/** A run of changes with the unchanged lines around them, as one `@@ … @@` block. */
export interface AparteDiffHunk {
    /** The first old line the hunk covers (the line before it when `oldCount` is 0). */
    oldStart: number;
    oldCount: number;
    /** The first new line the hunk covers (the line before it when `newCount` is 0). */
    newStart: number;
    newCount: number;
    /** What follows the second `@@`, when the tool that made the diff wrote it: the function the hunk is in. */
    section?: string;
    lines: AparteDiffLine[];
}

/** What happened to a file. */
export type AparteDiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed';

/** One file's change. */
export interface AparteDiffFile {
    /** The file's path: the new one, or the old one for a deleted file. */
    path: string;
    /** Its path before, when it was renamed. */
    oldPath?: string;
    /** What happened to it. Absent reads as `modified`, or `renamed` when `oldPath` differs from `path`. */
    status?: AparteDiffFileStatus;
    /** How many lines were added. */
    added: number;
    /** How many lines were removed. */
    removed: number;
    hunks: AparteDiffHunk[];
    /** A binary file: the diff says it changed, and shows no line. */
    binary?: boolean;
}

/** A file's text before and after: the element computes the diff, and can show every unchanged line. */
export interface AparteDiffSource {
    path: string;
    before: string;
    after: string;
    /** Its path before, when it was renamed. */
    oldPath?: string;
}

/** What `<aparte-diff>` shows: a unified diff's text, a file's two texts, or a list of files. */
export type AparteDiffInput = string | AparteDiffSource | ReadonlyArray<AparteDiffFile | AparteDiffSource>;

/** Which side of the change a line number counts on: the old file, or the new one. */
export type AparteDiffSide = 'old' | 'new';

/** A comment on a line or a range, as the app hands it to `<aparte-diff>` to show. */
export interface AparteDiffComment {
    /** Yours, to tell comments apart. The element does not read it. */
    id?: string;
    path: string;
    side: AparteDiffSide;
    startLine: number;
    endLine: number;
    text: string;
    /** Where it stands: kept to be sent (`pending`), or sent. Shown beside the comment. */
    state?: 'pending' | 'sent';
}

/**
 * A reader wrote a comment on a line or a range of `<aparte-diff commentable>` and sent it.
 * Bubbles out of the chat, and is cancelable: cancel it to keep the form open with the text
 * (the comment could not be kept, say). The element shows nothing of it on its own: hand it
 * back through `comments` to show it under its lines.
 *
 * @event aparte-diff-comment
 */
export interface AparteDiffCommentEventDetail {
    path: string;
    side: AparteDiffSide;
    startLine: number;
    endLine: number;
    text: string;
    /** The lines commented on, as they read on that side, joined with `\n`. */
    code: string;
}

// Typed where it is dispatched: `addEventListener('aparte-diff-comment', (e) => e.detail.text)`
// with no cast, on an element, the document or the window (it bubbles out of the chat). The
// type names the plugin's comment, so it cannot live in core's event map.
interface DiffEventMap {
    'aparte-diff-comment': CustomEvent<AparteDiffCommentEventDetail>;
}
declare global {
    interface HTMLElementEventMap extends DiffEventMap {}
    interface DocumentEventMap extends DiffEventMap {}
    interface WindowEventMap extends DiffEventMap {}
}
