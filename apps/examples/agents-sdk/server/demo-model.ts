/**
 * The keyless model: the demo runs with no API key at all.
 *
 * Built on the Agents SDK's own test double, `ScriptedModel` from `@openai/agents/testing`, so
 * the run around it — the loop, the tool call, the tool's execution, the stream — is the real
 * SDK's. Only the model's words are scripted: a message that names an order number gets a
 * `get_order_status` call, the tool's result gets a sentence, anything else gets a line saying
 * what this is. The text streams word by word, as a model's would.
 */
import type { AgentInputItem, Model, ModelRequest, ModelResponse, StreamEvent } from '@openai/agents';
import { ScriptedModel, assistantMessage, functionCall, modelResponder, modelStreamResponder } from '@openai/agents/testing';

type Output = ModelResponse['output'];
/** What a completed model stream carries: the same items, in the stream's own type. */
type DoneOutput = Extract<StreamEvent, { type: 'response_done' }>['response']['output'];

const USAGE = { requests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** The text of an input item, when it has one. */
function textOf(item: AgentInputItem): string {
    if (!('content' in item)) return '';
    const content = item.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : '')).join('');
}

/** What the model "says" to this request. */
export function scriptedOutput(request: ModelRequest): Output {
    const items: AgentInputItem[] = typeof request.input === 'string'
        ? [{ role: 'user', content: request.input }]
        : request.input;
    const last = items.at(-1);
    if (last && last.type === 'function_call_result') {
        const raw = last.output;
        const text = typeof raw === 'string' ? raw : 'text' in raw ? raw.text : JSON.stringify(raw);
        let status: { orderNumber?: string; status?: string; carrier?: string; arrives?: string } = {};
        try { status = JSON.parse(text); } catch { /* the tool answered in prose */ }
        return [assistantMessage(status.status
            ? `Order ${status.orderNumber} has ${status.status} with ${status.carrier} and arrives ${status.arrives}.`
            : text)];
    }
    const asked = [...items].reverse().find((item) => 'role' in item && item.role === 'user');
    const number = asked ? /\b(\d{3,})\b/.exec(textOf(asked))?.[1] : undefined;
    if (number) {
        return [functionCall('get_order_status', { orderNumber: number }, { callId: `call_${number}_${items.length}` })];
    }
    return [assistantMessage(
        'This demo runs on a scripted model, with no API key. Ask where an order is, '
        + 'such as "Where is order 1042?", to watch the agent call its tool.',
    )];
}

/** The same output as a model stream: the text word by word, then the completed response. */
async function* streamOf(output: Output, delayMs: number): AsyncIterable<StreamEvent> {
    yield { type: 'response_started' };
    for (const item of output) {
        if (item.type !== 'message' || item.role !== 'assistant') continue;
        for (const part of item.content) {
            if (part.type !== 'output_text') continue;
            for (const word of part.text.split(/(?<= )/)) {
                if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
                yield { type: 'output_text_delta', delta: word };
            }
        }
    }
    yield { type: 'response_done', response: { id: `resp_${Date.now()}`, usage: USAGE, output: output as DoneOutput } };
}

/**
 * A model for any number of turns: each call is answered by a fresh one-step `ScriptedModel`,
 * since a `ScriptedModel` consumes one scripted step per call.
 */
export class DemoModel implements Model {
    constructor(private readonly delayMs = 30) {}

    getResponse(request: ModelRequest): Promise<ModelResponse> {
        return new ScriptedModel([modelResponder(({ request: r }) => scriptedOutput(r))]).getResponse(request);
    }

    getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
        const delayMs = this.delayMs;
        return new ScriptedModel([modelStreamResponder(({ request: r }) => streamOf(scriptedOutput(r), delayMs))])
            .getStreamedResponse(request);
    }
}
