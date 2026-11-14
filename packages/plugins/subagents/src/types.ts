/**
 * The shapes the plugin writes and reads: a sub-agent, as it is kept on the segment that
 * stands for it, the plugin's own segment for a sub-agent no call opened, the options, and
 * the two events an app hears.
 */
import type { AparteSegment, AparteSegmentBase, AparteToolDetails } from '@aparte/core';

/** Where a sub-agent is: working, waiting for a person, or over — and how. */
export type AparteSubagentStatus = 'running' | 'waiting' | 'done' | 'failed' | 'stopped';

/**
 * A sub-agent, as it is saved with the conversation: on the call that opened it (the
 * `subagent` field of that `tool_call` segment), or on a `subagent` segment of its own.
 *
 * `segments` is its conversation — its text, its reasoning, its own tool calls — stamped
 * like a message's, and never part of the reply: the model never reads it back.
 */
export interface AparteSubagent {
    /** The sub-agent's id in the run (`agent-start`'s `agentId`). */
    id: string;
    /** Its name, what the line shows. */
    name?: string;
    /** What it was asked to do, shown after the name. */
    description?: string;
    /** As stored. Read it through `subagentStatus`, which knows a saved run is over. */
    status: AparteSubagentStatus;
    /** What it answered, when it is done. */
    result?: string;
    /** Why it failed, when it failed. */
    error?: string;
    /** The sub-agent that opened this one, when one did. */
    parentId?: string;
    /** Its conversation. */
    segments: AparteSegment[];
}

/** The segment type of a sub-agent that no call opened. */
export const SUBAGENT_SEGMENT_TYPE = 'subagent';

/**
 * A sub-agent no call opened (or a second one opened by the same call): a segment of the
 * plugin's own, drawn as the same line a call's sub-agent gets. `isStreaming` is true while
 * it works.
 */
export interface AparteSubagentSegment extends AparteSegmentBase {
    type: typeof SUBAGENT_SEGMENT_TYPE;
    subagent: AparteSubagent;
}

declare module '@aparte/core' {
    interface AparteSegmentTypes {
        subagent: AparteSubagentSegment;
    }
}

/** What `setupSubagents` shows on a sub-agent's line. */
export interface SubagentsOptions {
    /** What it is doing now — its latest running tool call — while it works. Default `true`. */
    activity?: boolean;
    /** "3 tools · 12 s" after the line: its tool calls and how long it worked. Default `true`. */
    counts?: boolean;
    /**
     * What is behind the line. `false` (the default): the line alone, with no disclosure.
     * A function: what it returns is shown under the line, as a tool display's `details`.
     * `'transcript'`: the sub-agent's conversation under the line (`subagentTranscript`),
     * closed until the reader opens it — or open, with the tool display's `open: true`.
     */
    details?: false | 'transcript' | AparteToolDetails;
    /**
     * What the line can open elsewhere. `'event'`: an Open button at the end of the line
     * dispatches `aparte-subagent-open`, for the app to show the sub-agent's conversation
     * somewhere else (`connectSubagentView` shows it in an `<aparte-subagent-view>` beside the
     * chat). A line with nothing behind it opens on a click anywhere on it too; with `details`,
     * the line keeps opening its detail and only the button opens elsewhere. Left out (the
     * default), the line opens nothing: no button, no pointer.
     */
    open?: false | 'event';
}

/**
 * A sub-agent started working for a reply, or started again after a pause. Bubbles out of
 * the chat, so an app can list a reply's sub-agents wherever it likes; the detail says which
 * call or which sub-agent opened it, when one did.
 *
 * @event aparte-subagent-start
 */
export interface AparteSubagentStartEventDetail {
    /** The chat the reply is in. */
    targetId?: string;
    /** The reply the sub-agent works for. */
    messageId: string;
    agentId: string;
    name?: string;
    description?: string;
    /** The call that opened it, when one did. */
    toolCallId?: string;
    /** The sub-agent that opened it, when one did. */
    parentId?: string;
}

/**
 * A sub-agent ended, or the run ended without it: `status` says how (`done`, `failed`,
 * `waiting` for a person, `stopped`). Bubbles out of the chat.
 *
 * @event aparte-subagent-end
 */
export interface AparteSubagentEndEventDetail {
    /** The chat the reply is in. */
    targetId?: string;
    messageId: string;
    agentId: string;
    status: AparteSubagentStatus;
}

/**
 * A reader pressed a sub-agent's Open button (`setupSubagents({ open: 'event' })`): show its
 * conversation elsewhere — an `<aparte-subagent-view>` with this `messageId` and `agentId`.
 * Dispatched from the line, bubbles and is composed.
 *
 * @event aparte-subagent-open
 */
export interface AparteSubagentOpenEventDetail {
    /** The chat the reply is in, when the line knows it. */
    targetId?: string;
    /** The reply the sub-agent works for: a view's `message-id`. */
    messageId: string;
    /** Which sub-agent: a view's `agent-id`. */
    agentId: string;
    name?: string;
    /** The call that opened it, when its line is that call's row. */
    toolCallId?: string;
}

declare global {
    interface HTMLElementEventMap {
        'aparte-subagent-start': CustomEvent<AparteSubagentStartEventDetail>;
        'aparte-subagent-end': CustomEvent<AparteSubagentEndEventDetail>;
        'aparte-subagent-open': CustomEvent<AparteSubagentOpenEventDetail>;
    }
}
