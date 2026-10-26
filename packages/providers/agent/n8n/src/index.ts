/**
 * @aparte/runner-n8n — put aparté on an n8n chat workflow.
 *
 * The workflow's agent runs in n8n (its model, its tools, its memory per session);
 * `AparteClient` draws its answer through the `streamRunner` seam, streamed when the
 * Chat Trigger streams. `loadN8nHistory` reads a session's messages back after a reload.
 */
export { createN8nRunner } from './runner.js';
export type { N8nRunnerOptions } from './runner.js';
export { loadN8nHistory, n8nHistoryToMessages } from './history.js';
export type { N8nHistoryOptions } from './history.js';
