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
import type { AparteChatMessage, AparteContentPart, AparteErrorSegment, AparteMessage, AparteSegment, AparteToolCallSegment } from '../types/index.js';
import { AparteErrorCode } from '../types/errors.js';
import { isModelReply } from '../utils/is-model-reply.js';

/** What a compaction summary goes out under, so the model reads it as context and not as the user's words. */
export const COMPACTION_PREAMBLE =
    'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';

/** A summary as the model reads it: the preamble, then the text. */
export const underPreamble = (text: string): string => `${COMPACTION_PREAMBLE}\n\n${text}`;

/**
 * The messages that open with a checkpoint's summary, and that opening. Beside the message
 * rather than on it: a field on the message would reach every backend that hands
 * `messages` to a model API as they are, and one that checks its input refuses a field it
 * does not know. The request names it in `_meta.historySummary` instead.
 */
const summaries = new WeakMap<AparteChatMessage, string>();

/** A checkpoint's summary as a history opens with it: a `user` message under the preamble, known as one. */
export function summaryMessage(text: string): AparteChatMessage {
    const message: AparteChatMessage = { role: 'user', content: underPreamble(text) };
    summaries.set(message, message.content as string);
    return message;
}

/** What a history opens with in place of the turns before its checkpoint, when it does: see `summaryMessage`. */
export function historySummaryOf(messages: readonly AparteChatMessage[]): string | undefined {
    for (const message of messages) {
        const summary = summaries.get(message);
        if (summary !== undefined) return summary;
    }
    return undefined;
}

/**
 * Merge ADJACENT messages of the same role into one, so the roles a model receives alternate.
 *
 * Strict chat templates (Gemma 2/3, Mistral, llama.cpp with `--jinja`, vLLM) reject two
 * `user` turns in a row, and once one is in the history every following turn fails the
 * same way. Ordinary situations produce it: a compaction (the summary is a `user` message
 * and the turns kept after it usually start with one), a failed turn (its user message
 * stays in the transcript, its error reply is not sent, and the user writes again), two
 * people writing in a row, and an advisor's message — sent as `assistant`, the service's
 * voice — right after the AI's reply or another advisor's.
 *
 * `user` messages merge, and `assistant` ones that carry no tool calls. A `system`, a
 * `tool`, or an `assistant` with calls carries structure (the calls and the ids that
 * answer them) that concatenating would destroy. Text joins with a blank line; parts
 * concatenate with a text separator between them; a string beside parts becomes a text
 * part, so an image keeps its place. The merged message keeps `name` only when its parts
 * all had the same one. A history that already alternates comes back as the same messages.
 */
export function mergeAdjacentMessages(messages: AparteChatMessage[]): AparteChatMessage[] {
    const asParts = (c: AparteChatMessage['content']): AparteContentPart[] =>
        typeof c === 'string' ? [{ type: 'text', text: c }] : c;
    const mergeable = (m: AparteChatMessage | undefined): boolean =>
        m !== undefined && (m.role === 'user' || (m.role === 'assistant' && !m.toolCalls?.length));
    const out: AparteChatMessage[] = [];
    for (const m of messages) {
        const prev = out[out.length - 1];
        if (!prev || prev.role !== m.role || !mergeable(prev) || !mergeable(m)) {
            out.push(m);
        } else {
            const { name: _prevName, ...base } = prev;
            const merged: AparteChatMessage = typeof prev.content === 'string' && typeof m.content === 'string'
                ? { ...base, content: `${prev.content}\n\n${m.content}` }
                : { ...base, content: [...asParts(prev.content), { type: 'text', text: '\n\n' }, ...asParts(m.content)] };
            // One author for the whole message, or none: two people's words under one name lie.
            if (prev.name !== undefined && prev.name === m.name) merged.name = prev.name;
            // A summary joined to the next message still opens it.
            const summary = summaries.get(prev);
            if (summary !== undefined) summaries.set(merged, summary);
            out[out.length - 1] = merged;
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
 * A call a resume leaves open: a paused one, and one not finished — still RUNNING, or
 * WAITING for a person with no ticket of its own: the call that opened a sub-agent paused
 * under it is not finished (a plugin may mark it waiting while the sub-agent's question is
 * up), and answering it `STOPPED_TOOL_TEXT` would tell the model it never ran. A server loop
 * never pauses on an unfinished call without its ticket (each call has settled or carries
 * one by then), so its resume is unchanged.
 */
const isLeftOpen = (segment: AparteSegment): segment is AparteToolCallSegment =>
    segment.type === 'tool_call'
    && ((segment as AparteToolCallSegment).status === 'pending' || (segment as AparteToolCallSegment).status === 'awaiting-approval');

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
         * Leave this message's paused calls unanswered — and its calls still running: the
         * request that RESUMES them sends the envelope with those calls open, for the
         * server to answer them.
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
                if (options.openDeferred && isLeftOpen(c)) continue;
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
            if (options.openDeferred && isLeftOpen(segment)) open = true;
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
 * is a plugin's type like any other and follows this rule. Such a segment may also say
 * what goes around its content (`wire`): the tag a grammar read it from, with the id the
 * model needs to name it again.
 *
 * `activity` stays out too: it is progress shown to a person, and its content the agent's data.
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
        } else if (segment.type === 'thinking' || segment.type === 'tool_call' || segment.type === 'error' || segment.type === 'activity') {
            // An activity is shown to a person, never read back by the model: named here, because
            // the rule below would send its content.
            continue;
        } else if (typeof content === 'string' && content) {
            // What the segment says goes around its content (`AparteSegmentBase.wire`).
            const wire = (segment as { wire?: { before?: unknown; after?: unknown } }).wire;
            const before = wire && typeof wire.before === 'string' ? wire.before : '';
            const after = wire && typeof wire.after === 'string' ? wire.after : '';
            parts.push(`${before}${content}${after}`);
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
 * The codes after which the same request fails again: too long for the window, refused by
 * the provider's policy, malformed. Every other code is a moment — the network, the
 * provider, a rate limit, a key — that the same request can get past.
 */
const FAILS_AGAIN: ReadonlySet<string> = new Set([
    AparteErrorCode.USAGE_CONTEXT_EXCEEDED,
    AparteErrorCode.PROVIDER_POLICY,
    AparteErrorCode.USAGE_BAD_REQUEST,
]);

/**
 * Whether a failed reply takes the messages that asked it out of every later request.
 *
 * Decided by the code its error carries (`AparteErrorSegment.code`, the last one): a code
 * the same request meets again drops them, or they would fail every turn after them. A
 * failure with no code (a transcript a host seeded) is one the request can get past.
 *
 * And a message that carried files: the history sends a message's text, never the files a
 * send read, so keeping it would send the text without them — a question about an image
 * the model is not shown.
 */
function failedForGood(reply: AparteMessage, asked: readonly AparteMessage[]): boolean {
    // The last error segment's code, read from the end without copying the array.
    const segments = reply.segments ?? [];
    let code: string | undefined;
    for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i]!;
        if (s.type === 'error') { code = (s as AparteErrorSegment).code; break; }
    }
    if (code !== undefined && FAILS_AGAIN.has(code)) return true;
    return asked.some((m) => (m.attachments?.length ?? 0) > 0);
}

/**
 * The messages, without the turns a later request gives up on: each reply that failed for
 * good and the messages that asked it — every user message since the last reply that did
 * not fail, since a failure the request got past sends its message again with the next one.
 *
 * A compaction summary message is part of no turn and always stays.
 *
 * Every other message stays, a failure the request can get past included: its message goes
 * with the next one (`mergeAdjacentMessages` joins the two), from the very next request
 * on, as a retry or an edit sends it, and its reply is sent as nothing (`wireMessages`).
 *
 * The one rule for send, retry, edit, a resume, the context gauge and a compaction, so the
 * history a server is sent never changes under it from one request to the next.
 *
 * @example
 * // U1's reply failed on the network: U1 goes with U2. Refused by the policy: it is gone.
 * withoutAbandonedTurns([u0, a0, u1, a1Failed, u2]);
 */
export function withoutAbandonedTurns(messages: readonly AparteMessage[]): AparteMessage[] {
    const dropped = new Set<AparteMessage>();
    let asked: AparteMessage[] = [];
    for (const m of messages) {
        if (m.role === 'user') {
            // A compaction summary (`compaction: true`) asks nothing: it stands for the turns
            // before it, and dropping it with a failed turn would lose them for good.
            if (!m.compaction) asked.push(m);
        } else if (isModelReply(m)) {
            // Only the model's reply settles the turn: a notice or an advisor's message
            // between the question and a reply that failed for good does not save it.
            if (m.status !== 'error') {
                asked = [];
            } else if (failedForGood(m, asked)) {
                for (const a of asked) dropped.add(a);
                dropped.add(m);
                asked = [];
            }
        }
    }
    return dropped.size === 0 ? [...messages] : messages.filter((m) => !dropped.has(m));
}

/**
 * The one rule for what a list of messages contributes to the wire.
 *
 * Not the slice — the contribution: a role the wire has (`user`/`assistant`), a
 * turn that neither failed nor is still in flight, and text that is not empty. A user
 * message whose reply failed for good is left out as well (`withoutAbandonedTurns`). A reply
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
    // A notice ("Marie joined") is shown, never said to the model.
    return withoutAbandonedTurns(messages.filter((m) => m.kind === undefined))
        .filter((m) => {
            if (m.role !== 'user' && m.role !== 'assistant') return false;
            return m.status !== 'error' && !isInFlight(m);
        })
        .flatMap((m): AparteChatMessage[] => {
            // Who wrote it, for a wire that has a place for it: never on a tool result.
            const named = <T extends AparteChatMessage>(c: T): T =>
                m.author?.name && (c.role === 'user' || c.role === 'assistant') ? { ...c, name: m.author.name } : c;
            if (m.role === 'assistant' && m.segments?.some((s) => s.type === 'tool_call')) {
                return wireTurns(m, segmentsToWireText).map(named);
            }
            const content = messageWireText(m);
            return content ? [named({ role: m.role as 'user' | 'assistant', content })] : [];
        });
}
