import { AparteError, AparteErrorCode } from '@aparte/core';

type AgUiEvent = { type: string } & Record<string, unknown>;

/** A stream AG-UI 1.0 says a client must reject. */
function malformed(reason: string): AparteError {
    return new AparteError(`The agent stream is malformed: ${reason}.`, AparteErrorCode.PROVIDER_ERROR, { agUi: 'malformed' });
}

/** Events whose `delta` the protocol defines as a string. */
const STRING_DELTA = new Set([
    'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CHUNK', 'TOOL_CALL_ARGS', 'TOOL_CALL_CHUNK',
    'REASONING_MESSAGE_CONTENT', 'REASONING_MESSAGE_CHUNK',
]);

/** The run-framing rejections end on the lever that reads such a stream, since one well-known producer needs it. */
const FRAMING_HINT = ' (TanStack AI frames runs this way: give createAgUiRunner relaxedRunFraming: true to read it)';

/**
 * The stream rules of AG-UI 1.0 a consumer enforces before anything is drawn: a run is
 * framed by RUN_STARTED and RUN_FINISHED, a message is opened before its content and
 * closed before the run ends, a chunk stream starts with its identity and keeps it, a
 * step or a subagent is started before it is finished. `relaxed` reads the run framing
 * with the older rules — a peer older than 1.0, or a producer named as framing runs its
 * own way (TanStack AI closes each step with a RUN_FINISHED and answers a resume before
 * its RUN_STARTED); every other rule holds.
 */
export function createVerifier(relaxed: boolean): (event: AgUiEvent) => void {
    let seen = false;
    let running = false;
    let finished = false;
    const text = new Set<string>();
    const reasoning = new Set<string>();
    const tools = new Set<string>();
    const steps = new Set<string>();
    const subagents = new Set<string>();
    /** Who an open message or call was attributed to when it started. */
    const attribution = new Map<string, unknown>();
    /** The chunk stream in progress: its kind and identity. A non-chunk event closes it, except RAW. */
    let chunk: { type: string; id: string; label?: string } | undefined;

    const attributed = (id: string, event: AgUiEvent) => {
        const by = event['subagentRunId'];
        if (by === undefined) return;
        const at = attribution.get(id);
        if (at !== undefined && at !== by) throw malformed(`${event.type} for "${id}" is attributed to "${String(by)}", but "${id}" started attributed to "${String(at)}"`);
    };

    return (event) => {
        const type = event.type;
        const first = !seen;
        seen = true;

        // Lifecycle: the run's framing.
        if (type === 'RUN_STARTED') {
            if (running && !relaxed) throw malformed('RUN_STARTED while a run is still active');
            running = true;
            finished = false;
            return;
        }
        if (type === 'RUN_ERROR') { running = false; return; }
        if (!relaxed) {
            if (first) throw malformed(`the first event must be RUN_STARTED, not ${type}${FRAMING_HINT}`);
            if (finished) throw malformed(`${type} after the run finished${FRAMING_HINT}`);
        }

        for (const key of ['delta'] as const) {
            if (STRING_DELTA.has(type) && key in event && typeof event[key] !== 'string') throw malformed(`"${key}" must be a string on ${type}`);
        }

        // A chunk stream closes on anything but another chunk of its kind, or RAW.
        if (chunk && type !== chunk.type && type !== 'RAW') chunk = undefined;

        switch (type) {
            case 'TEXT_MESSAGE_START': {
                const id = String(event['messageId']);
                text.add(id);
                attribution.set(id, event['subagentRunId']);
                break;
            }
            case 'TEXT_MESSAGE_CONTENT':
            case 'TEXT_MESSAGE_END': {
                const id = String(event['messageId']);
                if (!text.has(id)) throw malformed(`${type} for "${id}", but no open text message has that id`);
                attributed(id, event);
                if (type === 'TEXT_MESSAGE_END') text.delete(id);
                break;
            }
            case 'TEXT_MESSAGE_CHUNK':
            case 'REASONING_MESSAGE_CHUNK': {
                const id = typeof event['messageId'] === 'string' ? event['messageId'] : undefined;
                const role = typeof event['role'] === 'string' ? event['role'] : undefined;
                if (!chunk || (id !== undefined && id !== chunk.id)) {
                    if (id === undefined) throw malformed(`the first ${type} of a stream needs a messageId`);
                    chunk = { type, id, ...(role !== undefined ? { label: role } : {}) };
                } else if (role !== undefined && chunk.label !== undefined && role !== chunk.label) {
                    throw malformed(`${type} changes its role from "${chunk.label}" to "${role}" in the middle of message "${chunk.id}"`);
                }
                break;
            }
            case 'TOOL_CALL_CHUNK': {
                const id = typeof event['toolCallId'] === 'string' ? event['toolCallId'] : undefined;
                const name = typeof event['toolCallName'] === 'string' ? event['toolCallName'] : undefined;
                if (!chunk || (id !== undefined && id !== chunk.id)) {
                    if (id === undefined || name === undefined) throw malformed('the first TOOL_CALL_CHUNK of a call needs a toolCallId and a toolCallName');
                    chunk = { type, id, label: name };
                } else if (name !== undefined && name !== chunk.label) {
                    throw malformed(`TOOL_CALL_CHUNK changes its toolCallName from "${chunk.label}" to "${name}" in the middle of call "${chunk.id}"`);
                }
                break;
            }
            case 'TOOL_CALL_START': {
                const id = String(event['toolCallId']);
                tools.add(id);
                attribution.set(id, event['subagentRunId']);
                break;
            }
            case 'TOOL_CALL_ARGS':
            case 'TOOL_CALL_END': {
                const id = String(event['toolCallId']);
                if (!tools.has(id)) throw malformed(`${type} for "${id}", but no open tool call has that id`);
                attributed(id, event);
                if (type === 'TOOL_CALL_END') tools.delete(id);
                break;
            }
            case 'REASONING_MESSAGE_START': {
                const id = String(event['messageId']);
                if (event['role'] !== undefined && event['role'] !== 'reasoning') {
                    throw malformed(`REASONING_MESSAGE_START "${id}" has the role "${String(event['role'])}", where only role "reasoning" is allowed`);
                }
                reasoning.add(id);
                attribution.set(id, event['subagentRunId']);
                break;
            }
            case 'REASONING_MESSAGE_CONTENT':
            case 'REASONING_MESSAGE_END': {
                const id = String(event['messageId']);
                if (!reasoning.has(id)) throw malformed(`${type} for "${id}", but no open reasoning message has that id`);
                attributed(id, event);
                if (type === 'REASONING_MESSAGE_END') reasoning.delete(id);
                break;
            }
            case 'STEP_STARTED':
                steps.add(String(event['stepName']));
                break;
            case 'STEP_FINISHED': {
                const name = String(event['stepName']);
                if (!steps.has(name)) throw malformed(`STEP_FINISHED for step "${name}", which was not started`);
                steps.delete(name);
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
                const open = [...text].map((id) => `text message "${id}"`)
                    .concat([...reasoning].map((id) => `reasoning message "${id}"`))
                    .concat([...subagents].map((id) => `subagent "${id}"`));
                if (open.length && !relaxed) throw malformed(`${open.join(', ')} still running at RUN_FINISHED`);
                running = false;
                finished = !relaxed;
                break;
            }
        }
    };
}
