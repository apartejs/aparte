type AgUiEvent = { type: string } & Record<string, unknown>;

/** What every AG-UI event may carry. */
const BASE = ['type', 'timestamp', 'rawEvent', 'metadata'];

/**
 * The properties AG-UI 1.0 describes on each event, beyond `BASE`. Written out rather than
 * read from `@ag-ui/core`'s schemas, which would ship zod to every page; a test holds this
 * table to those schemas, so a protocol update that adds a field fails it.
 */
export const EVENT_KEYS: Record<string, readonly string[]> = {
    RUN_STARTED: ['threadId', 'runId', 'parentRunId', 'protocolVersion', 'input'],
    RUN_FINISHED: ['threadId', 'runId', 'outcome', 'result', 'usage'],
    RUN_ERROR: ['message', 'code', 'usage'],
    STEP_STARTED: ['stepName', 'subagentRunId'],
    STEP_FINISHED: ['stepName', 'subagentRunId'],
    TEXT_MESSAGE_START: ['messageId', 'role', 'name', 'subagentRunId'],
    TEXT_MESSAGE_CONTENT: ['messageId', 'delta', 'subagentRunId'],
    TEXT_MESSAGE_END: ['messageId', 'subagentRunId'],
    TEXT_MESSAGE_CHUNK: ['messageId', 'role', 'name', 'delta', 'subagentRunId'],
    TOOL_CALL_START: ['toolCallId', 'toolCallName', 'parentMessageId', 'subagentRunId'],
    TOOL_CALL_ARGS: ['toolCallId', 'delta', 'subagentRunId'],
    TOOL_CALL_END: ['toolCallId', 'subagentRunId'],
    TOOL_CALL_CHUNK: ['toolCallId', 'toolCallName', 'parentMessageId', 'delta', 'subagentRunId'],
    TOOL_CALL_RESULT: ['messageId', 'toolCallId', 'content', 'role', 'subagentRunId'],
    REASONING_START: ['messageId', 'subagentRunId'],
    REASONING_END: ['messageId', 'subagentRunId'],
    REASONING_MESSAGE_START: ['messageId', 'role', 'subagentRunId'],
    REASONING_MESSAGE_CONTENT: ['messageId', 'delta', 'subagentRunId'],
    REASONING_MESSAGE_END: ['messageId', 'subagentRunId'],
    REASONING_MESSAGE_CHUNK: ['messageId', 'delta', 'subagentRunId'],
    REASONING_ENCRYPTED_VALUE: ['subtype', 'entityId', 'encryptedValue', 'subagentRunId'],
    STATE_SNAPSHOT: ['snapshot', 'subagentRunId'],
    STATE_DELTA: ['delta', 'subagentRunId'],
    MESSAGES_SNAPSHOT: ['messages'],
    ACTIVITY_SNAPSHOT: ['messageId', 'activityType', 'content', 'replace', 'subagentRunId'],
    ACTIVITY_DELTA: ['messageId', 'activityType', 'patch', 'subagentRunId'],
    RAW: ['event', 'source', 'subagentRunId'],
    CUSTOM: ['name', 'value', 'subagentRunId'],
    SUBAGENT_STARTED: ['subagentRunId', 'name', 'description', 'parentMessageId', 'parentToolCallId', 'parentSubagentRunId'],
    SUBAGENT_FINISHED: ['subagentRunId', 'outcome', 'result'],
    SUBAGENT_ERROR: ['subagentRunId', 'message', 'code'],
};

/** The closed sets 1.0 names: a member outside them is stripped, as the protocol asks. */
const TEXT_ROLES = new Set(['developer', 'system', 'assistant', 'user']);
const OUTCOMES = new Set(['success', 'interrupt', 'cancelled']);
const CONTENT_PARTS = new Set(['text', 'image', 'audio', 'video', 'document']);

/**
 * AG-UI's rule for what a consumer does not recognise: survive it. An unknown event is
 * dropped, an undescribed property or an unknown member of a closed set is stripped, an
 * unknown element of a list is removed from it — each told to `warn` by its path, the
 * event otherwise left intact. A value of the wrong SHAPE is not unknown, it is
 * malformed, and is left for the verifier to reject.
 */
export function enforce(event: AgUiEvent, warn: (message: string) => void): AgUiEvent | undefined {
    const keys = EVENT_KEYS[event.type];
    if (!keys) {
        warn(`dropped an event of a type this runner does not know: ${event.type}.`);
        return undefined;
    }
    const out: AgUiEvent = { ...event };
    for (const key of Object.keys(out)) {
        if (!BASE.includes(key) && !keys.includes(key)) {
            delete out[key];
            warn(`stripped /${key} from ${event.type}: AG-UI 1.0 does not describe it.`);
        }
    }
    if ((out.type === 'TEXT_MESSAGE_START' || out.type === 'TEXT_MESSAGE_CHUNK') && typeof out['role'] === 'string' && !TEXT_ROLES.has(out['role'])) {
        warn(`stripped /role from ${out.type}: "${out['role']}" is not a message role.`);
        delete out['role'];
    }
    const outcome = out['outcome'];
    if (out.type === 'RUN_FINISHED' && outcome && typeof outcome === 'object' && !Array.isArray(outcome) && !OUTCOMES.has(String((outcome as { type?: unknown }).type))) {
        warn(`stripped /outcome from RUN_FINISHED: "${String((outcome as { type?: unknown }).type)}" is not an outcome AG-UI 1.0 describes; the run ends as a plain one.`);
        delete out['outcome'];
    }
    if (out.type === 'MESSAGES_SNAPSHOT' && Array.isArray(out['messages'])) {
        out['messages'] = (out['messages'] as unknown[]).map((message, i) => {
            const content = (message as { content?: unknown } | null)?.content;
            if (!Array.isArray(content)) return message;
            const kept = content.filter((part, j) => {
                const known = CONTENT_PARTS.has(String((part as { type?: unknown } | null)?.type));
                if (!known) warn(`stripped /messages/${i}/content/${j} from MESSAGES_SNAPSHOT: "${String((part as { type?: unknown } | null)?.type)}" is not a content part.`);
                return known;
            });
            return { ...(message as object), content: kept };
        });
    }
    return out;
}
