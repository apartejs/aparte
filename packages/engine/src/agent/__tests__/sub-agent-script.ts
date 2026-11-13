/**
 * Helpers for the sub-agent suites: a transport that plays one script per model id (the
 * parent and each sub-agent ask a different "model"), and an event recorder.
 */
import type { StreamChatEvent, StreamChatRequest, StreamRunEvent } from '../stream-events';

/** One step of a script: an event, or a pause of `ms` before the next one. */
export type ScriptStep = StreamChatEvent | { wait: number };

async function* play(steps: ScriptStep[]): AsyncIterable<StreamChatEvent> {
    for (const step of steps) {
        if ('wait' in step) await new Promise((r) => setTimeout(r, step.wait));
        else yield step;
    }
}

/**
 * A transport that answers each model id with its own list of turns, in order; a turn
 * past the end answers `done` alone.
 */
export function scripted(scripts: Record<string, ScriptStep[][]>) {
    const turns: Record<string, number> = {};
    const requests: StreamChatRequest[] = [];
    const transportCall = async (request: StreamChatRequest) => {
        requests.push(request);
        const n = turns[request.modelId] ?? 0;
        turns[request.modelId] = n + 1;
        return play(scripts[request.modelId]?.[n] ?? [{ type: 'done' }]);
    };
    return { transportCall, requests };
}

export function recorder() {
    const events: StreamRunEvent[] = [];
    return { events, emitter: (e: StreamRunEvent) => { events.push(e); } };
}

/** A request for a sub-agent that asks `model`. */
export function ask(model: string, content = 'go'): StreamChatRequest {
    return { modelId: model, messages: [{ role: 'user', content }] };
}

export const toolUse = (id: string, name: string, input: Record<string, unknown> = {}): StreamChatEvent =>
    ({ type: 'tool_use', id, name, input });
export const text = (delta: string): StreamChatEvent => ({ type: 'text', delta });
export const done: StreamChatEvent = { type: 'done' };

export const agentIdOf = (e: StreamRunEvent): string | undefined =>
    (e as { agentId?: string }).agentId;
export const indexOf = (events: StreamRunEvent[], match: (e: StreamRunEvent) => boolean): number =>
    events.findIndex(match);
