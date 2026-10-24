import { AparteError, AparteErrorCode } from '@aparte/core';

type AgUiEvent = { type: string } & Record<string, unknown>;

/** A stream AG-UI 1.0 says a client must reject. */
function malformed(reason: string): AparteError {
    return new AparteError(`The agent stream is malformed: ${reason}.`, AparteErrorCode.PROVIDER_ERROR, { agUi: 'malformed' });
}

/** Events whose `delta` the protocol defines as a string (STATE_DELTA's is a patch). */
const STRING_DELTA = new Set([
    'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CHUNK', 'TOOL_CALL_ARGS', 'TOOL_CALL_CHUNK',
    'REASONING_MESSAGE_CONTENT', 'REASONING_MESSAGE_CHUNK',
]);

/** Fields the protocol defines as strings, wherever they appear. */
const STRING_FIELDS = [
    'messageId', 'toolCallId', 'toolCallName', 'parentMessageId', 'stepName', 'subagentRunId', 'threadId', 'runId',
    'parentRunId', 'protocolVersion', 'name', 'role', 'message', 'code', 'activityType', 'entityId', 'encryptedValue',
    'subtype', 'description', 'parentToolCallId', 'parentSubagentRunId',
];

/** What identifies each event, without which it cannot be read: absent is malformed. */
const REQUIRED: Record<string, readonly string[]> = {
    TEXT_MESSAGE_START: ['messageId'], TEXT_MESSAGE_CONTENT: ['messageId', 'delta'], TEXT_MESSAGE_END: ['messageId'],
    TOOL_CALL_START: ['toolCallId', 'toolCallName'], TOOL_CALL_ARGS: ['toolCallId', 'delta'], TOOL_CALL_END: ['toolCallId'],
    TOOL_CALL_RESULT: ['toolCallId'],
    REASONING_START: ['messageId'], REASONING_END: ['messageId'],
    REASONING_MESSAGE_START: ['messageId'], REASONING_MESSAGE_CONTENT: ['messageId', 'delta'], REASONING_MESSAGE_END: ['messageId'],
    STEP_STARTED: ['stepName'], STEP_FINISHED: ['stepName'],
    SUBAGENT_STARTED: ['subagentRunId'], SUBAGENT_FINISHED: ['subagentRunId'], SUBAGENT_ERROR: ['subagentRunId'],
};

/** The run-framing rejections end on the lever that reads such a stream, since one well-known producer needs it. */
const FRAMING_HINT = ' (TanStack AI frames runs this way: give createAgUiRunner relaxedRunFraming: true to read it)';

export interface Verifier {
    (event: AgUiEvent): void;
    /** The stream is over. Under a relaxed run framing, what is still open is refused here, not at each RUN_FINISHED. */
    end(): void;
}

/**
 * The stream rules of AG-UI 1.0 a consumer enforces before anything is drawn: a run is
 * framed by RUN_STARTED and RUN_FINISHED (or RUN_ERROR, which ends what was open), a
 * message, a tool call, a step or a subagent is opened before it continues and closed
 * before the run finishes, a chunk stream starts with its identity and keeps it, and a
 * known field has its type. What is open is tracked per owner — the run, or each subagent
 * invocation — as the protocol requires: a parent and a subagent may each have a step of
 * the same name open, and one invocation ending closes none of another's.
 *
 * `relaxed` reads the run framing with the older rules — a peer older than 1.0, or a
 * producer named as framing runs its own way (TanStack AI closes each step with a
 * RUN_FINISHED and answers a resume before its RUN_STARTED): the framing is not checked,
 * and what is still open is refused at the end of the stream rather than at each
 * RUN_FINISHED. Every other rule holds.
 */
export function createVerifier(relaxed: boolean): Verifier {
    let seen = false;
    let running = false;
    /** How the last run closed, until a new RUN_STARTED: after a finish only RUN_STARTED or a late RUN_ERROR may come, after an error only RUN_STARTED. */
    let closed: 'finished' | 'error' | undefined;
    const text = new Map<string, unknown>();
    const reasoning = new Map<string, unknown>();
    const tools = new Map<string, unknown>();
    const steps = new Set<string>();
    const subagents = new Set<string>();
    /** The chunk stream in progress, per owner. A non-chunk event of that owner closes it, except RAW. */
    const chunks = new Map<string, { type: string; id: string; label?: string }>();

    const ownerOf = (event: AgUiEvent): string => (typeof event['subagentRunId'] === 'string' ? event['subagentRunId'] : '');
    const stepKey = (owner: string, name: string) => `${owner}\u0000${name}`;
    const nothingOpen = () => { text.clear(); reasoning.clear(); tools.clear(); steps.clear(); subagents.clear(); chunks.clear(); };
    const stillOpen = (): string[] => [...text.keys()].map((id) => `text message "${id}"`)
        .concat([...reasoning.keys()].map((id) => `reasoning message "${id}"`))
        .concat([...tools.keys()].map((id) => `tool call "${id}"`))
        .concat([...steps].map((key) => `step "${key.split('\u0000')[1]}"`))
        .concat([...subagents].map((id) => `subagent "${id}"`));

    /** A continuation must not disagree with the owner its opener named; an untagged one continues the opener. */
    const agrees = (id: string, opened: Map<string, unknown>, event: AgUiEvent) => {
        const by = event['subagentRunId'];
        if (by === undefined) return;
        const at = opened.get(id);
        if (at !== undefined && at !== by) throw malformed(`${event.type} for "${id}" is attributed to "${String(by)}", but "${id}" started attributed to "${String(at)}"`);
    };

    const verify = ((event: AgUiEvent) => {
        const type = event.type;
        const first = !seen;
        seen = true;

        for (const key of REQUIRED[type] ?? []) if (event[key] === undefined) throw malformed(`${type} needs "${key}"`);
        for (const key of STRING_FIELDS) if (key in event && event[key] !== undefined && typeof event[key] !== 'string') throw malformed(`"${key}" must be a string on ${type}`);
        if (STRING_DELTA.has(type) && 'delta' in event && typeof event['delta'] !== 'string') throw malformed(`"delta" must be a string on ${type}`);

        // Lifecycle: the run's framing.
        if (type === 'RUN_STARTED') {
            if (running && !relaxed) throw malformed('RUN_STARTED while a run is still active');
            running = true;
            closed = undefined;
            nothingOpen();   // a new run starts with nothing open
            return;
        }
        if (!relaxed) {
            // A RUN_ERROR may open a stream: an agent that could not start says so.
            if (first && type !== 'RUN_ERROR') throw malformed(`the first event must be RUN_STARTED, not ${type}${FRAMING_HINT}`);
            if (closed === 'finished' && type !== 'RUN_ERROR') throw malformed(`${type} after the run finished${FRAMING_HINT}`);
            if (closed === 'error') throw malformed(`${type} after the run ended with RUN_ERROR`);
        }
        if (type === 'RUN_ERROR') {
            // Ends the run, and whatever was still open with it.
            running = false;
            if (closed !== 'finished') closed = 'error';
            nothingOpen();
            return;
        }

        const owner = ownerOf(event);
        // A chunk stream closes on anything but another chunk of its kind from its owner, or RAW.
        const open = chunks.get(owner);
        if (open && type !== open.type && type !== 'RAW') chunks.delete(owner);
        if (type === 'SUBAGENT_FINISHED' || type === 'SUBAGENT_ERROR') chunks.delete(String(event['subagentRunId']));

        switch (type) {
            case 'TEXT_MESSAGE_START':
                text.set(String(event['messageId']), event['subagentRunId']);
                break;
            case 'TEXT_MESSAGE_CONTENT':
            case 'TEXT_MESSAGE_END': {
                const id = String(event['messageId']);
                if (!text.has(id)) throw malformed(`${type} for "${id}", but no open text message has that id`);
                agrees(id, text, event);
                if (type === 'TEXT_MESSAGE_END') text.delete(id);
                break;
            }
            case 'TEXT_MESSAGE_CHUNK':
            case 'REASONING_MESSAGE_CHUNK': {
                const id = typeof event['messageId'] === 'string' ? event['messageId'] : undefined;
                const role = typeof event['role'] === 'string' ? event['role'] : undefined;
                const current = chunks.get(owner);
                if (!current || (id !== undefined && id !== current.id)) {
                    if (id === undefined) throw malformed(`the first ${type} of a stream needs a messageId`);
                    chunks.set(owner, { type, id, ...(role !== undefined ? { label: role } : {}) });
                } else if (role !== undefined && current.label !== undefined && role !== current.label) {
                    throw malformed(`${type} changes its role from "${current.label}" to "${role}" in the middle of message "${current.id}"`);
                }
                break;
            }
            case 'TOOL_CALL_CHUNK': {
                const id = typeof event['toolCallId'] === 'string' ? event['toolCallId'] : undefined;
                const name = typeof event['toolCallName'] === 'string' ? event['toolCallName'] : undefined;
                const current = chunks.get(owner);
                if (!current || (id !== undefined && id !== current.id)) {
                    if (id === undefined || name === undefined) throw malformed('the first TOOL_CALL_CHUNK of a call needs a toolCallId and a toolCallName');
                    chunks.set(owner, { type, id, label: name });
                } else if (name !== undefined && name !== current.label) {
                    throw malformed(`TOOL_CALL_CHUNK changes its toolCallName from "${current.label}" to "${name}" in the middle of call "${current.id}"`);
                }
                break;
            }
            case 'TOOL_CALL_START':
                tools.set(String(event['toolCallId']), event['subagentRunId']);
                break;
            case 'TOOL_CALL_ARGS':
            case 'TOOL_CALL_END': {
                const id = String(event['toolCallId']);
                if (!tools.has(id)) throw malformed(`${type} for "${id}", but no open tool call has that id`);
                agrees(id, tools, event);
                if (type === 'TOOL_CALL_END') tools.delete(id);
                break;
            }
            case 'REASONING_MESSAGE_START': {
                const id = String(event['messageId']);
                if (event['role'] !== undefined && event['role'] !== 'reasoning') {
                    throw malformed(`REASONING_MESSAGE_START "${id}" has the role "${String(event['role'])}", where only role "reasoning" is allowed`);
                }
                reasoning.set(id, event['subagentRunId']);
                break;
            }
            case 'REASONING_MESSAGE_CONTENT':
            case 'REASONING_MESSAGE_END': {
                const id = String(event['messageId']);
                if (!reasoning.has(id)) throw malformed(`${type} for "${id}", but no open reasoning message has that id`);
                agrees(id, reasoning, event);
                if (type === 'REASONING_MESSAGE_END') reasoning.delete(id);
                break;
            }
            case 'STEP_STARTED':
                steps.add(stepKey(owner, String(event['stepName'])));
                break;
            case 'STEP_FINISHED': {
                const key = stepKey(owner, String(event['stepName']));
                if (!steps.has(key)) throw malformed(`STEP_FINISHED for step "${String(event['stepName'])}", which was not started${owner ? ` by "${owner}"` : ''}`);
                steps.delete(key);
                break;
            }
            case 'SUBAGENT_STARTED': {
                const id = String(event['subagentRunId']);
                if (typeof event['name'] !== 'string' || !event['name']) throw malformed(`SUBAGENT_STARTED "${id}" needs a name`);
                subagents.add(id);
                break;
            }
            case 'SUBAGENT_FINISHED':
            case 'SUBAGENT_ERROR': {
                const id = String(event['subagentRunId']);
                if (!subagents.has(id)) throw malformed(`${type} for subagent "${id}", which was not started`);
                subagents.delete(id);
                break;
            }
            case 'RUN_FINISHED': {
                const outcome = event['outcome'];
                if (outcome !== undefined && (typeof outcome !== 'object' || outcome === null || Array.isArray(outcome))) {
                    throw malformed('RUN_FINISHED.outcome must be an object');
                }
                if (!relaxed) {
                    const left = stillOpen();
                    if (left.length) throw malformed(`${left.join(', ')} still running at RUN_FINISHED`);
                    closed = 'finished';
                }
                chunks.clear();
                running = false;
                break;
            }
        }
    }) as Verifier;

    verify.end = () => {
        if (!relaxed) return;
        const left = stillOpen();
        if (left.length) throw malformed(`${left.join(', ')} still running at the end of the stream`);
    };
    return verify;
}
