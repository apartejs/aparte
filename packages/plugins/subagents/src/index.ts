/**
 * `@aparte/plugin-subagents` — a sub-agent's work, shown as one line.
 *
 * Core keeps a sub-agent's events out of the reply (its text is not the reply's, its calls
 * are not the reply's rows) and lets a plugin observe them. This plugin draws them: the call
 * that opened a sub-agent becomes its line — name, task, what it is doing now, "3 tools ·
 * 12 s", and its state — and the sub-agent's conversation is kept on that call, saved with
 * the conversation and never sent to the model. A sub-agent no call opened gets the same
 * line, from a segment of the plugin's own. Its conversation can be shown under the line
 * (`subagentTranscript`, `details: 'transcript'`) or anywhere else
 * (`<aparte-subagent-view>`), opened from the line's own button with `open: 'event'` and
 * `connectSubagentView`.
 */
export { setupSubagents } from './setup.js';
export { subagentOf, subagentStatus } from './status.js';
export { subagentTranscript } from './transcript.js';
export { connectSubagentView } from './connect.js';
export type { ConnectSubagentViewOptions, SubagentViewSplit } from './connect.js';
export { AparteSubagentView } from './aparte-subagent-view.js';
export type { SubagentViewSource } from './aparte-subagent-view.js';
export { SUBAGENT_SEGMENT_TYPE } from './types.js';
export type {
    AparteSubagent,
    AparteSubagentStatus,
    AparteSubagentSegment,
    SubagentsOptions,
    AparteSubagentStartEventDetail,
    AparteSubagentEndEventDetail,
    AparteSubagentOpenEventDetail,
} from './types.js';
