/**
 * What one message contributes to the history a turn sends — its tool calls included.
 *
 * A reply goes out in the order it was shown, so a tool's result stays in the model's
 * context on later turns: the text before some calls and those calls as an assistant
 * envelope, each call's answer as a `tool` message, the text after them as the next
 * envelope.
 *
 * Every call is answered, because a provider rejects a request that declares a call
 * with no `tool` message after it: a refusal sends its reason, a crash its error line,
 * and a call that never finished — stopped, still pending — a fixed sentence saying so.
 */
import type { AparteChatMessage, AparteMessage, AparteSegment, AparteToolCallSegment } from '../types/index.js';

/** The answer a call that never finished gives the model. */
export const STOPPED_TOOL_TEXT = 'The tool call was stopped before it ran.';

/** The answer a call that ran and returned nothing gives the model — not "stopped", or it tries again. */
export const EMPTY_TOOL_TEXT = 'The tool returned no output.';

function answerOf(segment: AparteToolCallSegment): string {
    const result = segment.result?.trim();
    if (segment.status === 'resolved') return result || EMPTY_TOOL_TEXT;
    if (segment.status === 'failed') return result || 'The tool failed.';
    if (segment.status === 'rejected') return result || STOPPED_TOOL_TEXT;
    return STOPPED_TOOL_TEXT;
}

/** A paused call still waiting for its answer — the one a resume leaves open for the server. */
export const isOpenDeferred = (segment: AparteSegment): segment is AparteToolCallSegment =>
    segment.type === 'tool_call'
    && Boolean((segment as AparteToolCallSegment).deferred)
    && ((segment as AparteToolCallSegment).status === 'awaiting-approval' || (segment as AparteToolCallSegment).status === 'pending');

/**
 * `textOf` turns a run of non-call segments into the text a model reads back — the
 * client's own reconstruction, so a fence or an artifact reads the same whether a call
 * sits beside it or not.
 */
export function wireTurns(
    message: AparteMessage,
    textOf: (segments: AparteSegment[]) => string,
    options: {
        /**
         * Leave this message's paused calls unanswered: the request that RESUMES them
         * sends the envelope with those calls open, for the server to answer them.
         */
        openDeferred?: boolean;
    } = {},
): AparteChatMessage[] {
    const segments = message.segments ?? [];
    if (message.role !== 'assistant' || !segments.some((s) => s.type === 'tool_call')) {
        const content = textOf(segments) || (typeof message.content === 'string' ? message.content : '');
        return content ? [{ role: message.role as AparteChatMessage['role'], content }] : [];
    }
    const out: AparteChatMessage[] = [];
    let texts: AparteSegment[] = [];
    let calls: AparteToolCallSegment[] = [];
    const flush = (): void => {
        const content = textOf(texts);
        if (calls.length === 0) {
            if (content) out.push({ role: 'assistant', content });
        } else {
            out.push({
                role: 'assistant',
                content,
                toolCalls: calls.map((c) => ({ id: c.toolCall.id, name: c.toolCall.name, input: c.toolCall.input })),
            });
            for (const c of calls) {
                if (options.openDeferred && isOpenDeferred(c)) continue;
                out.push({ role: 'tool', content: answerOf(c), toolCallId: c.toolCall.id, toolName: c.toolCall.name });
            }
        }
        texts = [];
        calls = [];
    };
    // Once a call is left open, the rest of the reply joins its envelope. The paused run
    // wrote ONE envelope for its turn, text after the calls included, and the server
    // resumes the calls that END the history: a second envelope after an open call is a
    // call left unanswered, and trailing text ends the history on no call at all.
    let open = false;
    for (const segment of segments) {
        if (segment.type === 'tool_call') {
            calls.push(segment as AparteToolCallSegment);
            if (options.openDeferred && isOpenDeferred(segment)) open = true;
        } else {
            if (calls.length > 0 && !open) flush();
            texts.push(segment);
        }
    }
    flush();
    return out;
}
