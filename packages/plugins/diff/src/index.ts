/**
 * `@aparte/plugin-diff` — a file change as hunks with line numbers.
 *
 * `<aparte-diff>` shows a change the way a reviewer reads one — each file under its path and
 * counts, each line with its old and new numbers, the unchanged runs folded — and, with
 * `commentable`, lets the reader comment on a line or a range. `setupDiff` draws a tool's
 * result with it, under the tool's line in the reply. The computation (`diffTexts`,
 * `parseUnifiedDiff`, `formatUnifiedDiff`) is plain functions with no DOM, here and in the
 * server entry.
 */
export { AparteDiff } from './aparte-diff.js';
export { setupDiff } from './setup.js';
export type { DiffSetupOptions } from './setup.js';
export { diffTexts } from './compute.js';
export type { DiffTextsOptions } from './compute.js';
export { parseUnifiedDiff, formatUnifiedDiff } from './parse.js';
export type {
    AparteDiffComment,
    AparteDiffCommentEventDetail,
    AparteDiffFile,
    AparteDiffFileStatus,
    AparteDiffHunk,
    AparteDiffInput,
    AparteDiffLine,
    AparteDiffLineKind,
    AparteDiffSide,
    AparteDiffSource,
} from './types.js';
