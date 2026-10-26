/**
 * transcript.ts — what the summariser reads.
 *
 * A message as the model should read it before summarising: its text, then one line
 * per tool call — the name, the input, the result or the status — and one per error.
 * The history the loop sends leaves tool calls out on purpose (it already carries them
 * as a call and a result); a summary is where they would otherwise be lost, and a long
 * session of tool work used to compact into a summary that had never seen a tool run.
 */

import type { AparteMessage } from '@aparte/core';

/**
 * The summariser's instruction. English, because it is addressed to the model and not
 * to the user; a host that wants another language or emphasis passes `prompt`.
 *
 * It fixes the SECTIONS of a summary rather than leaving them to the model's taste: a
 * summary is read by a model that has nothing else, and one that is free to choose its
 * shape drops the section it finds least interesting, which is usually the open tasks.
 * It asks for the conversation's own language because a summary in another one is
 * answered in it. The same summary is also handed back to be UPDATED at the next
 * compaction (the request then opens with "Summary so far:"), so the sections are what
 * keeps a summary of a summary from drifting into prose.
 *
 * The last sentence is the one that is easy to leave out and expensive to omit. The
 * instruction rides the final user turn, which is also where a reply to the
 * conversation would go, so a model reading a transcript that ends in a question has
 * two plausible things to do: summarise, or answer. Every implementation that puts the
 * instruction in the user turn carries a clause like this one, and one goes further and
 * inserts a fake assistant turn to get it — a host replacing `prompt` should keep it.
 */
export const DEFAULT_COMPACTION_PROMPT =
    'You are compacting a conversation between a user and an assistant so that it can continue ' +
    'with less context. Write a summary the assistant can pick the work up from, in these ' +
    'sections, each one short and factual: ' +
    "1. The user's goal and constraints. " +
    '2. Decisions taken, and why. ' +
    '3. Tasks still open. ' +
    '4. Facts and tool results still needed: names, values, errors, outcomes. ' +
    '5. The next step. ' +
    'Lines marked [tool …] are tool calls with their result. Write in the language of the ' +
    'conversation, in the third person, as compact as completeness allows. No preamble. ' +
    'Do not continue the conversation, do not answer a question it contains and do not call a ' +
    'tool: reply with the summary and nothing else.';

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);
const safeJson = (value: unknown): string => {
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return String(value);
    }
};

/**
 * A message's text — the rule core's history serializer follows, so the summariser
 * reads what the model would have read: streamed replies keep their text in
 * `segments` (fences and the language tag kept, a type this plugin does not know by
 * its `content` else its `fallback`), and `content` is the fallback for a
 * non-streaming reply that wrote no segments at all.
 */
export function messageText(message: AparteMessage): string {
    const parts: string[] = [];
    for (const segment of message.segments ?? []) {
        const content = (segment as { content?: unknown }).content;
        if (segment.type === 'text') {
            if (typeof content === 'string' && content) parts.push(content);
        } else if (segment.type === 'code') {
            const lang = (segment as { language?: string }).language ?? '';
            parts.push(`\`\`\`${lang}\n${typeof content === 'string' ? content : ''}\n\`\`\``);
        } else if (segment.type === 'thinking' || segment.type === 'tool_call' || segment.type === 'error') {
            continue;
        } else if (typeof content === 'string' && content) {
            parts.push(content);
        } else {
            const fallback = (segment as { fallback?: unknown }).fallback;
            if (typeof fallback === 'string' && fallback) parts.push(fallback);
        }
    }
    const rendered = parts.join('\n').trim();
    if (rendered) return rendered;
    return typeof message.content === 'string' ? message.content : '';
}

/**
 * The transcript line(s) of one message for the summariser: the text, then
 * `[tool name] input → result` per tool call (the input clipped at 300 characters, the
 * result at 600) and `[error] …` per error segment.
 */
export function transcriptForSummary(message: AparteMessage): string {
    const lines: string[] = [];
    const text = messageText(message);
    if (text) lines.push(text);
    for (const segment of message.segments ?? []) {
        if (segment.type === 'tool_call') {
            const call = segment.toolCall;
            const input = clip(safeJson(call.input), 300);
            const outcome = segment.result !== undefined
                ? `→ ${clip(segment.result, 600)}`
                : `(${segment.status})`;
            lines.push(`[tool ${call.name}] ${input} ${outcome}`);
        } else if (segment.type === 'error') {
            const content = (segment as { content?: string }).content;
            if (content) lines.push(`[error] ${clip(content, 300)}`);
        }
    }
    return lines.join('\n');
}
