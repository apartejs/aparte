/**
 * `@aparte/plugin-diff` — the DOM-free entry, for Node and SSR.
 *
 * Everything but the element: the computation (`diffTexts`, `parseUnifiedDiff`,
 * `formatUnifiedDiff`), the setup and the types. A server can prepare a diff and send it as
 * data or as text; `setupDiff()` registers the same display there, and draws nothing without
 * a document. `scripts/check-node-import.mjs` asserts this entry imports without a DOM.
 */
export { diffTexts } from './compute.js';
export type { DiffTextsOptions } from './compute.js';
export { parseUnifiedDiff, formatUnifiedDiff } from './parse.js';
export { setupDiff } from './setup.js';
export type { DiffSetupOptions } from './setup.js';
// The element's TYPE only — `export type` is erased, so this entry stays DOM-free while an
// SSR consumer can still name `AparteDiff` in a signature.
export type { AparteDiff } from './aparte-diff.js';
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
