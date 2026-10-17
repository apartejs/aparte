/**
 * The conversations the Assistant opens with, as a store would hand them over: one record per
 * conversation, with its messages. store.ts serves them to the library's conversation manager.
 *
 * The replies are the scripted model's own words (scenario.ts). A reply is stored as segments,
 * the shape a saved turn has: core's parser splits the Markdown (a fence becomes a code card),
 * and a reasoning block carries the span the client measured when it streamed, which is what
 * the "Thought for 6.4s" line reads. One conversation carries a branch tree: a reply in two
 * versions, with the ‹2/2› picker on it.
 */
import { parseMarkdownToSegments } from '@aparte/core';
import type { AparteAttachment, AparteConversation, AparteMessage, AparteSegment } from '@aparte/core';
import {
    BREAD_ANSWER_PERCENT,
    BREAD_ANSWER_TABLE,
    BREAD_QUESTION,
    INVOICE_ANSWER,
    INVOICE_QUESTION,
    REGEX_ANSWER,
    REGEX_QUESTION,
    SALES_ANSWER,
    SALES_QUESTION,
    SALES_THINKING,
    TRIP_ANSWER,
    TRIP_QUERY,
    TRIP_QUESTION,
    TRIP_RESULTS,
} from './scenario';

const MINUTE = 6e4;
const HOUR = 36e5;
const DAY = 864e5;
const now = Date.now();

const user = (id: string, at: number, content: string, attachments?: AparteAttachment[]): AparteMessage => ({
    id,
    role: 'user',
    content,
    timestamp: now - at,
    ...(attachments ? { attachments } : {}),
});

// A saved segment carries its message's id and its place in it, as the transcript hands it to
// the store; a record without them would read as changed the first time it is saved again.
const assistant = (id: string, at: number, segments: AparteSegment[]): AparteMessage => ({
    id,
    role: 'assistant',
    segments: segments.map((segment, index) => ({ ...segment, messageId: id, index })),
    timestamp: now - at,
});

/** A reply's Markdown, split the way the stream splits it. */
const answer = (markdown: string): AparteSegment[] => parseMarkdownToSegments(markdown);

/** A settled reasoning block that lasted `ms`. */
const reasoning = (id: string, at: number, ms: number, content: string): AparteSegment => ({
    id,
    type: 'thinking',
    content,
    isStreaming: false,
    meta: { aparte: { startedAt: now - at - ms, endedAt: now - at } },
});

/** The export the first conversation is about: a file chip, nothing to fetch. */
const ORDERS_CSV: AparteAttachment = { id: 'f-orders', name: 'orders-q2-q3.csv', type: 'text/csv', url: '', size: 48_213 };

const record = (id: string, title: string, at: number, messages: AparteMessage[]): AparteConversation => ({
    id,
    title,
    createdAt: now - at,
    updatedAt: now - at,
    messages,
});

/** The reply in two versions: the table first, then a retry that answered in percentages. */
const bread = (() => {
    const question = user('u-bread', DAY + 3 * HOUR, BREAD_QUESTION);
    const first = assistant('a-bread-1', DAY + 3 * HOUR - 20_000, answer(BREAD_ANSWER_TABLE));
    const second = assistant('a-bread-2', DAY + 3 * HOUR - 90_000, answer(BREAD_ANSWER_PERCENT));
    return {
        ...record('c-bread', 'Scale a sourdough recipe', DAY + 3 * HOUR - 90_000, [question, second]),
        tree: {
            headId: second.id,
            messages: [
                { message: question, parentId: null },
                { message: first, parentId: question.id },
                { message: second, parentId: question.id },
            ],
        },
    };
})();

export const CONVERSATIONS: AparteConversation[] = [
    record('c-sales', 'Q3 orders by region', 20 * MINUTE, [
        user('u-sales', 21 * MINUTE, SALES_QUESTION, [ORDERS_CSV]),
        assistant('a-sales', 20 * MINUTE, [reasoning('s-sales-think', 20 * MINUTE, 6400, SALES_THINKING), ...answer(SALES_ANSWER)]),
    ]),
    record('c-trip', 'A quiet weekend at Lake Varden', 3 * HOUR, [
        user('u-trip', 3 * HOUR + MINUTE, TRIP_QUESTION),
        assistant('a-trip', 3 * HOUR, [
            {
                id: 's-trip-search',
                type: 'tool_call',
                isStreaming: false,
                status: 'resolved',
                toolCall: { id: 't-trip-search', name: 'web_search', input: { query: TRIP_QUERY } },
                result: TRIP_RESULTS,
            },
            ...answer(TRIP_ANSWER),
        ]),
    ]),
    bread,
    record('c-invoice', 'Reminder for a late invoice', 4 * DAY, [
        user('u-invoice', 4 * DAY + MINUTE, INVOICE_QUESTION),
        assistant('a-invoice', 4 * DAY, answer(INVOICE_ANSWER)),
    ]),
    record('c-regex', 'Regex for order numbers', 12 * DAY, [
        user('u-regex', 12 * DAY + MINUTE, REGEX_QUESTION),
        assistant('a-regex', 12 * DAY, answer(REGEX_ANSWER)),
    ]),
];

/** The conversation the app opens on. */
export const FIRST_CONVERSATION = CONVERSATIONS[0]!.id;
