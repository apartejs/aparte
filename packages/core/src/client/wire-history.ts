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
import type { AparteChatMessage, AparteContentPart, AparteMessage, AparteSegment, AparteToolCallSegment } from '../types/index.js';

/** What a compaction summary goes out under, so the model reads it as context and not as the user's words. */
export const COMPACTION_PREAMBLE =
    'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';

/** A summary as the model reads it: the preamble, then the text. */
export const underPreamble = (text: string): string => `${COMPACTION_PREAMBLE}\n\n${text}`;

/**
 * Merge ADJACENT `user` messages into one, so the roles a model receives alternate.
 *
 * Strict chat templates (Gemma 2/3, Mistral, llama.cpp with `--jinja`, vLLM) reject two
 * `user` turns in a row, and once one is in the history every following turn fails the
 * same way. Two ordinary situations produce it: a compaction (the summary is a `user`
 * message and the turns kept after it usually start with one), and a failed turn (its
 * user message stays in the transcript, its error reply is not sent, and the user writes
 * again).
 *
 * Only `user` is merged. A `system`, `assistant` or `tool` message carries structure
 * (tool calls and the ids that answer them) that concatenating would destroy. Text joins
 * with a blank line; parts concatenate with a text separator between them; a string
 * beside parts becomes a text part, so an image keeps its place. A history that already
 * alternates comes back as the same messages.
 */
export function mergeAdjacentUserMessages(messages: AparteChatMessage[]): AparteChatMessage[] {
    const asParts = (c: AparteChatMessage['content']): AparteContentPart[] =>
        typeof c === 'string' ? [{ type: 'text', text: c }] : c;
    const out: AparteChatMessage[] = [];
    for (const m of messages) {
        const prev = out[out.length - 1];
        if (m.role !== 'user' || prev?.role !== 'user') {
            out.push(m);
        } else if (typeof prev.content === 'string' && typeof m.content === 'string') {
            out[out.length - 1] = { ...prev, content: `${prev.content}\n\n${m.content}` };
        } else {
            out[out.length - 1] = {
                ...prev,
                content: [...asParts(prev.content), { type: 'text', text: '\n\n' }, ...asParts(m.content)],
            };
        }
    }
    return out;
}

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

/**
 * A turn that has not finished yet. `status` is OPTIONAL on `AparteMessage`, so
 * the question the history gates can ask is "is this still in flight?", never
 * "is this completed?".
 *
 * The gates ask the first, because a host that SEEDS a transcript
 * — restoring a saved conversation, hydrating a server-rendered one — has no
 * reason to invent a status for turns that are already over. Asking "is this
 * completed?" would leave the cutoff at 0 and slice away the whole transcript: the
 * model would get the new question with no context, and nothing in the UI would say
 * so, because the viewport still shows every message.
 */
export const isInFlight = (m: AparteMessage): boolean => m.status === 'streaming' || m.status === 'pending';

/**
 * Segments → the text a model can read back.
 *
 * Fences and the language tag are kept. Without them the model re-reads its own
 * code as prose — which is how it starts explaining a snippet it believes it
 * wrote in English.
 *
 * A type core does not know — a registered block grammar's (an artifact, a
 * citation, a file), a consumer's custom segment — follows one rule: its
 * `content` if it has one, else its `fallback`, else nothing. Dropping such a
 * segment would make a document the model had just produced invisible on the very
 * next turn, so it could not be asked to change the thing it had built. An artifact
 * is a plugin's type like any other and follows this rule.
 *
 * `thinking` and `tool_call` stay out on purpose — the first is the model's own
 * scratchpad, and most APIs neither want it back nor bill for it kindly; the
 * second is not text: `wireMessages` sends a reply's calls as the assistant's
 * `toolCalls` and the `tool` messages answering them (`wireTurns`).
 */
export function segmentsToWireText(segments: AparteMessage['segments']): string {
    if (!segments?.length) return '';
    const fence = '```';
    const parts: string[] = [];
    for (const segment of segments) {
        const content = (segment as { content?: string }).content;
        if (segment.type === 'text') {
            if (content) parts.push(content);
        } else if (segment.type === 'code') {
            const lang = (segment as { language?: string }).language ?? '';
            parts.push(`${fence}${lang}\n${content ?? ''}\n${fence}`);
        } else if (segment.type === 'thinking' || segment.type === 'tool_call' || segment.type === 'error') {
            continue;
        } else if (typeof content === 'string' && content) {
            parts.push(content);
        } else {
            const fallback = (segment as { fallback?: string }).fallback;
            if (fallback) parts.push(fallback);
        }
    }
    return parts.join('\n').trim();
}

/**
 * What the model is told it said last turn — reconstructed from what was
 * RENDERED, not from the raw-text field.
 *
 * The segments are what the reader saw, so they come first. `content` is the
 * fallback, and that is not vestigial: a non-streaming transport writes the whole
 * reply there and creates no segments at all.
 */
function extractWireText(message: AparteMessage): string {
    const rendered = segmentsToWireText(message.segments);
    if (rendered) return rendered;
    if (typeof message.content === 'string' && message.content) return message.content;
    return '';
}

/**
 * A message's text as the MODEL should read it — the one mapper both history
 * paths use, so the compaction preamble cannot be applied on retry and edit and
 * forgotten on the ordinary send, which is what the first review of this feature
 * caught: the summary went out on every normal turn as something the user said.
 */
export function messageWireText(message: AparteMessage): string {
    const text = extractWireText(message);
    return message.compaction ? underPreamble(text) : text;
}

/**
 * The one rule for what a list of messages contributes to the wire.
 *
 * Not the slice — the contribution: a role the wire has (`user`/`assistant`), a
 * turn that neither failed nor is still in flight, and text that is not empty. A reply
 * that called tools goes out as the calls and their answers, in the order it showed
 * them (`wireTurns`); every other message keeps its one text, compaction preamble
 * included.
 *
 * `messageWireText` (not `m.content`): assistant replies stream their text into
 * `segments`, leaving `content` as '', so without flattening every reply would be
 * empty here and the drop below would swallow the whole transcript.
 *
 * Pure, so the client that SENDS this history and the measure that ESTIMATES it
 * (`estimateWireTokens`) read the same serialisation and cannot drift.
 */
export function wireMessages(messages: AparteMessage[]): AparteChatMessage[] {
    return messages
        .filter((m) => {
            if (m.role !== 'user' && m.role !== 'assistant') return false;
            return m.status !== 'error' && !isInFlight(m);
        })
        .flatMap((m): AparteChatMessage[] => {
            if (m.role === 'assistant' && m.segments?.some((s) => s.type === 'tool_call')) {
                return wireTurns(m, segmentsToWireText);
            }
            const content = messageWireText(m);
            return content ? [{ role: m.role as 'user' | 'assistant', content }] : [];
        });
}
