/**
 * What the shopping assistant says. Everything else is the real library; only the model is a
 * script, so the shop answers without a key and the same way every time.
 *
 * A turn that calls a tool ends there: the loop runs the tool (asking first for the return),
 * then asks the model again with the result, and `after` — or `match`, for a choice that depends
 * on what was asked or answered — picks what it says next. The order of the `when` rules matters:
 * the first that matches answers, so "return the board from my last order" is a return, not an
 * order, and "compare the Ember" a comparison, not the Ember's sheet.
 */
import { contentToText } from '@aparte/core';
import type { AparteChatRequest, AparteMessage } from '@aparte/core';
import { defaultMatch } from '@aparte/provider-scenario';
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';
import { ASSISTANT_NAME, CUSTOMER, SHOP_NAME } from './brand';
import { dropOffDay, PAST_ORDER, type ReturnReason } from './orders';
import { COMPARE_TOOL, DETAIL_TOOL, describeProducts, ORDER_TOOL, RETURN_TOOL, SEARCH_TOOL, searchProducts } from './tools';

/** What the landing's showcase types, and the first starter. */
export const PLAY_QUESTION = 'Find me a pour-over kettle under €80';

/** The starters under the welcome; each is a question the script answers. */
export const SUGGESTIONS = [
    { label: 'A pour-over kettle', prompt: PLAY_QUESTION },
    { label: 'Gift ideas under €50', prompt: 'Any gift ideas under €50?' },
    { label: 'Where is my order?', prompt: 'Where is my order?' },
    { label: 'Return an item', prompt: 'I’d like to return the serving board I bought last week.' },
];

const KETTLES_ANSWER =
    'For pour-over, the **Ember** is the one to beat: it holds the water at the degree you set, and it’s **20% off** this week. The **Tern** gives you the same thin pour on the hob for about half the price. The Drift has only a few left, and the Halyard ships from 20 November.';

const REASON_QUESTION = {
    questions: [
        {
            question: 'Why are you sending it back?',
            header: 'Reason',
            options: [
                { title: 'Doesn’t suit my kitchen', description: 'Free return, full refund' },
                { title: 'Arrived damaged', description: 'No need to send it back' },
                { title: 'Ordered by mistake', description: 'Free return, full refund' },
            ] satisfies { title: ReturnReason; description: string }[],
        },
    ],
};

/** The return, once the reason is known: a line, then the call core asks the customer to approve. */
function startReturn(reason: ReturnReason, lead: string): ScenarioTurn {
    return [{ text: lead }, { tool: RETURN_TOOL, input: { order: PAST_ORDER.reference, item: PAST_ORDER.item, reason } }];
}

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default: `I can find you something, compare products, check where an order is, or start a return. Try **find a pour-over kettle** or **where is my order?**`,

    return: {
        when: /\breturn|send (it|this|them) back|refund/i,
        turn: [
            { text: `Of course. Your **Ash Serving Board** from order #${PAST_ORDER.reference} is inside its 30-day return window. One question first:` },
            { tool: 'ask_user', input: REASON_QUESTION },
        ],
    },
    order: { when: /order|parcel|package|track|deliver|arriv/i, turn: [{ tool: ORDER_TOOL, input: { reference: 'PC-48213' } }] },
    compare: {
        when: /compare|differen|versus|\bvs\b/i,
        turn: [{ tool: COMPARE_TOOL, input: { ids: ['ember-kettle', 'tern-kettle', 'drift-kettle'] } }],
    },
    detail: { when: /ember|tell me more|more about/i, turn: [{ tool: DETAIL_TOOL, input: { id: 'ember-kettle' } }] },
    gifts: { when: /gift|present/i, turn: [{ tool: SEARCH_TOOL, input: { query: 'gifts', max_price: 50 } }] },
    kettles: { when: /kettle|pour.?over|coffee|\btea\b/i, turn: [{ tool: SEARCH_TOOL, input: { query: 'pour-over kettles', max_price: 80 } }] },

    // After a search: what to say about it depends on what was asked (picked by `match`).
    found: { after: SEARCH_TOOL, turn: 'Here is what I found. Tap a product to open it, or ask me about one.' },
    'found-kettles': KETTLES_ANSWER,
    'found-gifts':
        'The **Fold mugs** are the most-given thing in the shop, and the **Ash board** is €8 off this week. All of them ship free, except the apron, which arrives by Friday.',
    detailed: {
        after: DETAIL_TOOL,
        turn: 'It’s the kettle I’d pick for pour-over: it holds a temperature to the degree for an hour, the 0.9-litre body is light enough to pour slowly, and delivery is free. The other kettles are under it if you want to look around.',
    },
    compared: {
        after: COMPARE_TOOL,
        turn: [
            '|  | Ember | Tern | Drift |',
            '| --- | --- | --- | --- |',
            '| Heats on | Its own base | The hob | The hob |',
            '| Holds a temperature | 40–100 °C | No | No |',
            '| Spout | Gooseneck | Gooseneck | Short |',
            '| Capacity | 0.9 L | 0.8 L | 1.6 L |',
            '| Price | €79 (was €99) | €42 | €54 |',
            '',
            'For pour-over every morning, the **Ember**. For the odd weekend cup, the **Tern** pours just as well for half the price. The **Drift** is a tea kettle: lovely, but its short spout floods a dripper.',
        ].join('\n'),
    },
    tracked: {
        after: ORDER_TOOL,
        turn: 'Your parcel left our warehouse yesterday. **Parcelway** expects to deliver it **tomorrow**, and **Track** follows it to your door.',
    },

    // After the reason (picked by `match` from the answer).
    reasoned: { after: 'ask_user', turn: '' },
    'return-suit': startReturn('Doesn’t suit my kitchen', 'Thanks, that happens. Here is the return, ready to start:'),
    'return-mistake': startReturn('Ordered by mistake', 'No problem. Here is the return, ready to start:'),
    'return-damaged': startReturn('Arrived damaged', 'I’m sorry it arrived like that. You won’t need to send it back; confirm and I’ll refund you now:'),
    'return-skipped': `No problem. The board can be returned until **${dropOffDay()}**, whenever you’re ready.`,

    // After the return: done, refunded at once, or not approved (picked by `match`).
    returned: {
        after: RETURN_TOOL,
        turn: `Done. The return label is in your inbox at **${CUSTOMER.email}**: drop the board at any Parcelway point by **${dropOffDay()}**, and the refund reaches your card 3 to 5 days after it’s scanned.`,
    },
    'returned-damaged': 'Done. The refund is on its way and reaches your card in 3 to 5 days. Thanks for telling us; I’ve let our packing team know.',
    'return-declined': `No problem, nothing has changed. The board can be returned until **${dropOffDay()}** if you change your mind.`,

    picture: `Thanks for the photo. I can’t look at pictures yet, but describe what you’re after and I’ll find it.`,
};

const REASON_ROUTE: Record<string, string> = {
    'Doesn’t suit my kitchen': 'return-suit',
    'Arrived damaged': 'return-damaged',
    'Ordered by mistake': 'return-mistake',
};

function lastUserText(request: AparteChatRequest): string {
    const user = request.messages.findLast((message) => message.role === 'user');
    return user ? contentToText(user.content) : '';
}

/**
 * The choices the default rule cannot make. It routes a tool's result to the scenario that
 * declared `after` for it; which words follow depends on what was asked, on the reason chosen,
 * or on whether the customer approved the return.
 */
export function match(request: AparteChatRequest, scenarios: Record<string, Scenario>): string | undefined {
    const last = request.messages[request.messages.length - 1];
    if (last?.role === 'user' && Array.isArray(last.content) && last.content.some((part) => part.type === 'image')) return 'picture';
    const route = defaultMatch(request, scenarios);
    if (route === 'found') return /gift|present/i.test(lastUserText(request)) ? 'found-gifts' : 'found-kettles';
    if (route === 'reasoned' && last) return REASON_ROUTE[contentToText(last.content)] ?? 'return-skipped';
    if (route === 'returned' && last) {
        const result = contentToText(last.content);
        // The loop's words when the customer rejects the call.
        if (/rejected (by the user|this tool call)/.test(result)) return 'return-declined';
        if (result.includes('No need')) return 'returned-damaged';
    }
    return undefined;
}

/** The welcome every conversation opens on, stamped with now. */
export function welcome(): AparteMessage {
    return {
        id: 'welcome',
        role: 'assistant',
        timestamp: Date.now(),
        content: `Hi ${CUSTOMER.firstName}, I’m **${ASSISTANT_NAME}**, ${SHOP_NAME}’s shopping assistant. I can find you something, compare products, check on an order or start a return.`,
    };
}

/** The conversation a tile shows, finished: the question, the kettles as cards, the advice. */
export function seed(): AparteMessage[] {
    const search = searchProducts('pour-over kettles', 80);
    const at = Date.now() - 60_000;
    return [
        { id: 'u1', role: 'user', content: PLAY_QUESTION, timestamp: at },
        {
            id: 'a1',
            role: 'assistant',
            timestamp: at + 3000,
            segments: [
                {
                    id: 's1',
                    type: 'tool_call',
                    status: 'resolved',
                    toolCall: { id: 't1', name: SEARCH_TOOL, input: { query: search.query, max_price: 80 } },
                    result: describeProducts(search.results),
                    structuredResult: search,
                },
                { id: 's2', type: 'text', content: KETTLES_ANSWER },
            ],
        },
    ];
}
