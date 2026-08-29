/**
 * `@aparte/plugin-approval` — the DOM-free entry, for Node and SSR.
 *
 * Everything a server can legitimately use: the setup, the controller, the table.
 * What is NOT here is `<aparte-approval-mode>`, which needs a document. Resolved
 * through core's `node` condition, `import '@aparte/plugin-approval'` on a server
 * registers the policy and nothing else — `scripts/check-node-import.mjs` asserts
 * this entry keeps importing without a DOM.
 */
export { setupApproval, getApprovalController } from './approval.js';
export type { ApprovalSetupOptions, ApprovalController } from './approval.js';
export { APPROVAL_MODES, classifyTool, rulingFor, createApprovalPolicy } from './policy.js';
export type { ApprovalMode, ToolClass, ToolMatcher, ApprovalClassification } from './policy.js';
// The element's TYPE only — `export type` is erased, so this entry stays DOM-free while
// an SSR consumer on node16/nodenext can still name `AparteApprovalMode` in a signature.
export type { AparteApprovalMode } from './aparte-approval-mode.js';
export type {
    AparteApprovalPolicy, AparteApprovalRuling, AparteToolCall, AparteApprovalModeChangeEventDetail,
} from '@aparte/core';
