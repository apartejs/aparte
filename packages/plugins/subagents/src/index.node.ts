/**
 * `@aparte/plugin-subagents` — the DOM-free entry, for Node and SSR.
 *
 * Everything the browser entry exports is DOM-free at import: the observer and the line are
 * plain functions, and the `subagent` segment's renderer only builds DOM when a chat draws
 * it — in a browser. So `setupSubagents()` here installs the same three pieces, and a
 * conversation rendered on a server reads its sub-agents' state through `subagentOf` and
 * `subagentStatus`. `scripts/check-node-import.mjs` asserts this entry imports without a DOM.
 */
export { setupSubagents } from './setup.js';
export { subagentOf, subagentStatus } from './status.js';
export { SUBAGENT_SEGMENT_TYPE } from './types.js';
export type {
    AparteSubagent,
    AparteSubagentStatus,
    AparteSubagentSegment,
    SubagentsOptions,
    AparteSubagentStartEventDetail,
    AparteSubagentEndEventDetail,
} from './types.js';
