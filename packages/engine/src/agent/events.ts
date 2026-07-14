/**
 * events.ts — AG-UI Protocol compliant event types
 *
 * Source : https://docs.ag-ui.com/concepts/events
 *
 * Aparte adopts AG-UI as the standard event protocol between :
 *   - Agent logic (in apps/home/core/agent/agent-loop.ts)
 *   - Consumers : browser UI (apps/home), Node tests (tests-node), future CLI/mobile
 *
 * Only the subset Aparte V1 needs is implemented here.
 * Additional event types (Activity, Reasoning, State*) can be added as needed.
 */

/**
 * Base event shape — every AG-UI event has a `type` discriminant and optional timestamp.
 */
export interface AGUIBaseEvent {
    type: string;
    timestamp?: number;
}

// ─── Lifecycle events ─────────────────────────────────────────────────

export interface RunStartedEvent extends AGUIBaseEvent {
    type: 'RUN_STARTED';
    threadId: string;
    runId: string;
    parentRunId?: string;
    input?: { userMessage: string;[key: string]: unknown };
}

export interface RunFinishedEvent extends AGUIBaseEvent {
    type: 'RUN_FINISHED';
    outcome?:
        | { type: 'success' }
        | { type: 'interrupt'; interrupts: Array<{ reason: string }> };
    result?: { finalMessage?: string; iterations?: number; [k: string]: unknown };
}

export interface RunErrorEvent extends AGUIBaseEvent {
    type: 'RUN_ERROR';
    message: string;
    code?: string;
}

export interface StepStartedEvent extends AGUIBaseEvent {
    type: 'STEP_STARTED';
    stepName: string;
}

export interface StepFinishedEvent extends AGUIBaseEvent {
    type: 'STEP_FINISHED';
    stepName: string;
}

// ─── Text message events (streamed assistant output) ─────────────────

export type MessageRole = 'developer' | 'system' | 'assistant' | 'user' | 'tool';

export interface TextMessageStartEvent extends AGUIBaseEvent {
    type: 'TEXT_MESSAGE_START';
    messageId: string;
    role: MessageRole;
}

export interface TextMessageContentEvent extends AGUIBaseEvent {
    type: 'TEXT_MESSAGE_CONTENT';
    messageId: string;
    delta: string;  // non-empty
}

export interface TextMessageEndEvent extends AGUIBaseEvent {
    type: 'TEXT_MESSAGE_END';
    messageId: string;
}

// ─── Tool call events ─────────────────────────────────────────────────

export interface ToolCallStartEvent extends AGUIBaseEvent {
    type: 'TOOL_CALL_START';
    toolCallId: string;
    toolCallName: string;
    parentMessageId?: string;
}

export interface ToolCallArgsEvent extends AGUIBaseEvent {
    type: 'TOOL_CALL_ARGS';
    toolCallId: string;
    delta: string;  // streamed JSON args (or Pythonic args body)
}

export interface ToolCallEndEvent extends AGUIBaseEvent {
    type: 'TOOL_CALL_END';
    toolCallId: string;
}

export interface ToolCallResultEvent extends AGUIBaseEvent {
    type: 'TOOL_CALL_RESULT';
    messageId: string;
    toolCallId: string;
    content: string;
    role?: 'tool';
}

// ─── State events (memory + conversation snapshots) ──────────────────

export interface StateSnapshotEvent extends AGUIBaseEvent {
    type: 'STATE_SNAPSHOT';
    snapshot: Record<string, unknown>;
}

export interface MessagesSnapshotEvent extends AGUIBaseEvent {
    type: 'MESSAGES_SNAPSHOT';
    messages: Array<{ role: MessageRole; content: string; [k: string]: unknown }>;
}

// ─── Custom Aparte event (escape hatch for things AG-UI doesn't cover) ─

export interface CustomEvent extends AGUIBaseEvent {
    type: 'CUSTOM';
    name: string;
    value: unknown;
}

// ─── Union ────────────────────────────────────────────────────────────

export type AGUIEvent =
    | RunStartedEvent
    | RunFinishedEvent
    | RunErrorEvent
    | StepStartedEvent
    | StepFinishedEvent
    | TextMessageStartEvent
    | TextMessageContentEvent
    | TextMessageEndEvent
    | ToolCallStartEvent
    | ToolCallArgsEvent
    | ToolCallEndEvent
    | ToolCallResultEvent
    | StateSnapshotEvent
    | MessagesSnapshotEvent
    | CustomEvent;

/**
 * Event emitter contract — agent loop emits, consumers (UI / tests) subscribe.
 */
export type AGUIEmitter = (event: AGUIEvent) => void;

/**
 * Standard event types as constants (use for switch statements).
 */
export const EventType = {
    RUN_STARTED: 'RUN_STARTED',
    RUN_FINISHED: 'RUN_FINISHED',
    RUN_ERROR: 'RUN_ERROR',
    STEP_STARTED: 'STEP_STARTED',
    STEP_FINISHED: 'STEP_FINISHED',
    TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
    TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
    TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
    TOOL_CALL_START: 'TOOL_CALL_START',
    TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
    TOOL_CALL_END: 'TOOL_CALL_END',
    TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
    STATE_SNAPSHOT: 'STATE_SNAPSHOT',
    MESSAGES_SNAPSHOT: 'MESSAGES_SNAPSHOT',
    CUSTOM: 'CUSTOM',
} as const;
