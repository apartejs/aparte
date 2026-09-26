/**
 * What one message contributes to the history a turn sends — its tool calls included.
 *
 * The history used to carry user and assistant TEXT only, so a tool's result was on
 * screen and gone from the model's context one turn later: "what did the file say?" had
 * no answer. A reply now goes out in the order it was shown: the text before some calls
 * and those calls as an assistant envelope, each call's answer as a `tool` message, the
 * text after them as the next envelope.
 *
 * Every call is answered, because a provider rejects a request that declares a call
 * with no `tool` message after it: a refusal sends its reason, a crash its error line,
 * and a call that never finished — stopped, still pending — a fixed sentence saying so.
 */
import type { AparteChatMessage, AparteMessage, AparteSegment, AparteToolCallSegment } from '../types/index.js';

/** The answer a call that never finished gives the model. */
export const STOPPED_TOOL_TEXT = 'The tool call was stopped before it ran.';

function answerOf(segment: AparteToolCallSegment): string {
    if (segment.status === 'resolved' || segment.status === 'rejected' || segment.status === 'failed') {
        return segment.result?.trim() || STOPPED_TOOL_TEXT;
    }
    return STOPPED_TOOL_TEXT;
}

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
                if (options.openDeferred && c.deferred && (c.status === 'awaiting-approval' || c.status === 'pending')) continue;
                out.push({ role: 'tool', content: answerOf(c), toolCallId: c.toolCall.id, toolName: c.toolCall.name });
            }
        }
        texts = [];
        calls = [];
    };
    for (const segment of segments) {
        if (segment.type === 'tool_call') {
            calls.push(segment as AparteToolCallSegment);
        } else {
            if (calls.length > 0) flush();
            texts.push(segment);
        }
    }
    flush();
    return out;
}
