/**
 * `@aparte/plugin-approval` — approval MODES for tool calls: plan, ask, auto-edit, auto.
 *
 * Core owns the mechanism (a per-call approval policy on the config, the gate in the
 * loop, the panel that asks at the composer, the refusal the model reads); the product
 * owns the policy — which of ITS tool names read, write or execute — and this plugin is
 * the small piece between them: a classification, a switchable mode, a nine-cell table,
 * and a `<aparte-approval-mode>` select for the composer's toolbar. It executes
 * nothing and stores nothing.
 */
export { setupApproval, getApprovalController } from './approval.js';
export type { ApprovalSetupOptions, ApprovalController } from './approval.js';
export { APPROVAL_MODES, classifyTool, rulingFor, createApprovalPolicy } from './policy.js';
export type { ApprovalMode, ToolClass, ToolMatcher, ApprovalClassification } from './policy.js';
export { AparteApprovalMode } from './aparte-approval-mode.js';
export type {
    AparteApprovalPolicy, AparteApprovalRuling, AparteToolCall, AparteApprovalModeChangeEventDetail,
} from '@aparte/core';
