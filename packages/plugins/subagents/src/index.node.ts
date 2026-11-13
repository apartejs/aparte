/**
 * `@aparte/plugin-subagents` — the DOM-free entry, for Node and SSR.
 *
 * Everything the browser entry exports but the element is DOM-free at import: the observer
 * and the line are plain functions, the `subagent` segment's renderer only builds DOM when a
 * chat draws it — in a browser — and `subagentTranscript` returns `''` without a document. So `setupSubagents()` here installs the same three pieces, and a
 * conversation rendered on a server reads its sub-agents' state through `subagentOf` and
 * `subagentStatus`. `scripts/check-node-import.mjs` asserts this entry imports without a DOM.
 */
export { setupSubagents } from './setup.js';
export { subagentOf, subagentStatus } from './status.js';
export { subagentTranscript } from './transcript.js';
// The element's TYPE only — `export type` is erased, so this entry stays DOM-free while an
// SSR consumer can still name `AparteSubagentView` in a signature.
export type { AparteSubagentView, SubagentViewSource } from './aparte-subagent-view.js';
export { SUBAGENT_SEGMENT_TYPE } from './types.js';
export type {
    AparteSubagent,
    AparteSubagentStatus,
    AparteSubagentSegment,
    SubagentsOptions,
    AparteSubagentStartEventDetail,
    AparteSubagentEndEventDetail,
} from './types.js';
