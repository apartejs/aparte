import type { AparteConfig } from '../config/aparte-config.js';
import { contentToText, type AparteChatMessage, type AparteUsage } from '../types/chat.js';
import type { AparteMessage } from '../types/models.js';
import type { AparteTool } from '../types/tools.js';
import { segmentsToWireText, underPreamble, wireMessages } from '../client/wire-history.js';
import { historyFromCheckpoint } from './checkpoint.js';

/**
 * Token heuristic (FR ~3.5 chars/tok, EN ~4 chars/tok).
 *
 * Accurate to ±10% — enough for budgeting, and it avoids a tokenizer, which costs ~5ms
 * per message × N (too slow to run on every turn) and is one more dependency per model
 * family. It is the ONE estimate: the compaction plugin's budget and selector, the
 * gauge, and the number the client records on a reply all read it, so the figures they
 * show and the decisions they take cannot disagree about what a message costs.
 */
export function estimateTokens(text: string | null | undefined): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
}

const estimateJson = (value: unknown): number => {
    if (!value) return 0;
    try {
        return estimateTokens(JSON.stringify(value));
    } catch {
        return 0;
    }
};

/**
 * The estimate of a request's messages as the WIRE carries them: each message's text, and
 * for an assistant envelope the calls it declares. Parts other than text (an image's
 * bytes) are not counted — a character heuristic has nothing honest to say about them.
 *
 * Exported for the code that holds the request already built, where `estimateWireTokens`
 * would serialise the transcript a second time.
 */
export function estimateChatTokens(messages: AparteChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
        total += estimateTokens(contentToText(message.content));
        if (message.toolCalls?.length) total += estimateJson(message.toolCalls);
    }
    return total;
}

/**
 * Whether the heuristic could see the whole request: false when a message carries a part
 * other than text (an image), which {@link estimateChatTokens} counts as nothing. An
 * estimate of such a request is a floor, not a reading, and must not be set beside the
 * provider's real count as if it were one.
 */
export function carriesNonTextParts(messages: AparteChatMessage[]): boolean {
    return messages.some((m) => typeof m.content !== 'string' && m.content.some((p) => p.type !== 'text'));
}

/**
 * The estimate of a whole request as it is about to be sent: its messages (the system
 * prompts and a checkpoint's summary among them) and the tool definitions beside them —
 * the same four things {@link measureContext} adds up, so a figure recorded here at send
 * time and the measure's own reading of the same view are one currency, which is what lets
 * the one calibrate the other.
 */
export function estimateRequestTokens(request: { messages: AparteChatMessage[]; tools?: AparteTool[] | undefined }): number {
    const declared = (request.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    return estimateChatTokens(request.messages) + (declared.length ? estimateJson(declared) : 0);
}

/**
 * The estimate of what the wire sends for these messages: the same serialisation the
 * client builds its history with (`wireMessages`) — a reply's thinking is not sent, its
 * text is, and a tool call and its result count as the envelope and the `tool` message
 * the wire carries. A failed turn and one still in flight send nothing.
 *
 * Not `estimateTokens(message.content)`: assistant replies keep their text in
 * `segments` with `content` empty, so that sum would read a whole conversation as free.
 */
export function estimateWireTokens(messages: AparteMessage[]): number {
    return estimateChatTokens(wireMessages(messages));
}

/** Tokens one turn reports as used: the provider's total, else the prompt plus the reply. */
export const usageTokens = (usage: AparteUsage): number => usage.totalTokens ?? (usage.inputTokens + usage.outputTokens);

/**
 * The registered tools, unless the current model says it cannot call one.
 *
 * Single source for the gate, so send / retry / edit — and the measure of what they send —
 * cannot drift.
 *
 * The question is "did this model say it cannot", not "did it say it can": the app sets a
 * model id by hand (`setModelConfig`) or a selector sets it from a fetched list, and in both
 * cases the model's declared capabilities are commonly unknown. `undefined` capabilities
 * read as "can", or `tools: []` would go on the wire while `getTools()` held the tool the
 * app had explicitly registered, and the model would answer that it had no such tool.
 * Registering a tool is an explicit act by the app; silently dropping it because a
 * `/models` listing is terse is the library second-guessing the developer. A model that
 * declares its capabilities and omits function calling is still honoured — that is a
 * statement, and it is respected.
 *
 * Failure modes, both ways round: over-sending means a model that cannot use tools does
 * not call one, or its own endpoint rejects the array with an error the developer can
 * read. Under-sending would be silent, total, and look like a lying model.
 */
export function toolsForCurrentModel(config: AparteConfig): AparteTool[] {
    const capabilities = config.getCurrentModel()?.capabilities;
    const declinesTools = capabilities ? !capabilities.includes('function_calling') : false;
    return declinesTools ? [] : config.getTools();
}

/**
 * What fills the model's window, as one reading. `used` is the total the gauge draws;
 * `parts` say where it goes.
 *
 * The parts are RAW estimates (the character heuristic, uncalibrated), so they are
 * labelled as estimates wherever they are shown and need not add up to `used`: the
 * difference, `other`, is what the heuristic cannot see — a server loop's own system
 * prompt and tools, the chat template's tokens, the heuristic's own error.
 */
export interface AparteContextMeasure {
    /** The window `used` is measured against, when one is known. */
    window?: number;
    /** Tokens in use: the last reply's reported usage, or an estimate of the request the next turn would send. */
    used: number;
    /** `true` when `used` is an estimate — something changed in what the model reads since the last reply reported. */
    estimated: boolean;
    /** Raw estimates, in tokens, of what the model reads: the system prompts, the tool definitions, the checkpoint's summary, the messages after it. */
    parts: { system: number; tools: number; summary: number; messages: number };
    /** `used` less the parts, never below zero. */
    other: number;
}

/** What {@link measureContext} reads. */
export interface AparteContextMeasureInput {
    /** The ACTIVE path of the conversation, checkpoint and all — not the view after it. */
    messages: AparteMessage[];
    /** The config that resolves the system prompt, the tools and the current model. */
    config: AparteConfig;
    /** A window that wins over the current model's, for a page that knows better (the gauge's `window` attribute). */
    windowOverride?: number | null | undefined;
    /**
     * The caller knows what the model reads has changed since the last reply although the
     * messages cannot say so — a Restore takes checkpoints off, and nothing is left on the
     * path to date it. Forces an estimate.
     */
    viewChanged?: boolean;
}

/** The model's window as the measure reads it: the override, else the current model's. */
export function windowOf(config: AparteConfig, windowOverride?: number | null): number | undefined {
    if (typeof windowOverride === 'number' && Number.isFinite(windowOverride) && windowOverride > 0) return windowOverride;
    const declared = config.getCurrentModel()?.contextWindow;
    return declared && declared > 0 ? declared : undefined;
}

const hasSegment = (message: AparteMessage, type: string): boolean => message.segments?.some((s) => s.type === type) === true;

/**
 * How far the heuristic was off on this reply: the provider's input count over the estimate
 * recorded when the request was sent, clamped to [0.5, 3]. 1 when either is missing, and
 * when the reply called tools — see {@link measureContext}.
 */
function calibration(reply: AparteMessage): number {
    const sent = reply.usage?.inputTokens;
    const recorded = reply.contextEstimate;
    if (hasSegment(reply, 'tool_call')) return 1;
    return sent && recorded && sent > 0 && recorded > 0 ? Math.min(3, Math.max(0.5, sent / recorded)) : 1;
}

/**
 * What the request after this reply will carry, given nothing has changed since it: the
 * provider's total, unless the reply thought. A reply with a thinking segment is the input
 * plus what it said AFTER its last call (the calls and their results were already in the
 * input), read from the transcript and never above what the provider says it generated.
 * A provider that reports no input count (`inputTokens: 0`) gives nothing to add the answer
 * to, so its total stands, reasoning and all: over-reading is safer than reading the
 * visible answer alone and missing a full window.
 */
function nextRequestTokens(reply: AparteMessage, k: number): number {
    const usage = reply.usage!;
    if (!hasSegment(reply, 'thinking') || !(usage.inputTokens > 0)) return usageTokens(usage);
    const segments = reply.segments ?? [];
    const lastCall = segments.map((s) => s.type).lastIndexOf('tool_call');
    const said = Math.round(k * estimateTokens(segmentsToWireText(segments.slice(lastCall + 1))));
    return usage.inputTokens + (usage.outputTokens > 0 ? Math.min(said, usage.outputTokens) : said);
}

/**
 * The one measure of the context window, for the gauge and for the compaction plugin.
 *
 * `used` is the last reply's REAL usage while nothing the model reads has changed since
 * it: the reply is the last message of the path, and no checkpoint was written after it.
 * Once something has (a message was added, a compaction ran), the real number describes a
 * request that will not be sent again, so `used` becomes an estimate of the request that
 * WOULD be sent — the system prompts, the tool definitions, the checkpoint's summary and
 * the messages after it — scaled by `k`, how far the heuristic was off on the last reply:
 * its real input tokens over the estimate recorded when it was sent
 * (`AparteMessage.contextEstimate`), clamped to [0.5, 3] so one odd reply cannot throw the
 * reading, and 1 when the reply has no estimate. After a compaction the reading is
 * therefore the size of the new, smaller view, never the stale one from before it, and
 * never a `k` computed against a history the reply did not see.
 *
 * `k` compares like with like or it is 1. The estimate is of the FIRST request a turn sent
 * and the usage is of its LAST call, which also read the calls and their results, so a
 * reply that called tools says nothing about the heuristic's error and counts as 1. A
 * request the heuristic could not read whole (an image) records no estimate at all.
 *
 * While nothing has changed, `used` is what the NEXT request will carry: the input the
 * provider reported, plus the reply as it goes back on the wire. A provider's output count
 * includes the reasoning it generated, and a reply's thinking is not sent again, so for a
 * reply that thought the answer is read from the transcript (the part after its last call,
 * which is all the final call added to what it read) and not from the output count.
 *
 * The parts are not scaled: they stay the raw estimates, so a reader can see what the
 * measure is made of.
 */
export function measureContext(input: AparteContextMeasureInput): AparteContextMeasure {
    const { messages, config } = input;
    const view = historyFromCheckpoint(messages);
    const system = estimateTokens(config.resolveSystemPrompt()) + estimateTokens(config.resolveToolSystemPrompts());
    // The definitions as a provider is sent them. An empty list is nothing, not the two characters of `[]`.
    const declared = toolsForCurrentModel(config).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    const tools = declared.length ? estimateJson(declared) : 0;
    const summary = view.summary === undefined ? 0 : estimateTokens(underPreamble(view.summary));
    const parts = { system, tools, summary, messages: estimateWireTokens(view.messages) };
    const total = system + tools + summary + parts.messages;

    let replyIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.role === 'assistant' && messages[i]!.usage) { replyIndex = i; break; }
    }
    const reply = replyIndex >= 0 ? messages[replyIndex]! : undefined;

    const window = windowOf(config, input.windowOverride);
    const result = (used: number, estimated: boolean): AparteContextMeasure => ({
        ...(window !== undefined ? { window } : {}),
        used,
        estimated,
        parts,
        other: Math.max(0, used - total),
    });

    const unchanged = reply !== undefined
        && !input.viewChanged
        && replyIndex === messages.length - 1
        && !messages.some((m) => m.contextSummary !== undefined && m.contextSummary.createdAt > reply.timestamp);
    const k = reply ? calibration(reply) : 1;
    if (reply && unchanged) return result(nextRequestTokens(reply, k), false);
    return result(Math.round(k * total), true);
}
