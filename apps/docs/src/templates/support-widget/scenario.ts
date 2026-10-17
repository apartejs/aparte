/**
 * What the support assistant says. Everything else in the widget is the real library; only the
 * model is a script, so the widget answers without a key and the same way every time.
 *
 * A turn that calls a tool ends there: the loop runs the tool, then asks the model again with
 * the result, and `after` (or `match`, for a choice that depends on the topic or the answer)
 * picks what it says next.
 */
import { contentToText } from '@aparte/core';
import type { AparteChatRequest, AparteMessage } from '@aparte/core';
import { defaultMatch } from '@aparte/provider-scenario';
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';
import { ASSISTANT_NAME } from './brand';
import { HANDOFF_TOOL } from './handoff';
import { describeSearch, helpSearch, SEARCH_TOOL } from './help-center';

const WAITLIST_ANSWER = 'Yes, any class can keep a waitlist, on the **Studio** and **Collective** plans. One question first:';
const PLAN_INCLUDED = 'Then you have them: choose **Edit → Capacity** and switch on **Waitlist**.';

const PLAN_QUESTION = {
    questions: [
        {
            question: 'Which plan is your studio on?',
            header: 'Plan',
            options: [
                { title: 'Starter', description: 'Free, one teacher' },
                { title: 'Studio', description: '$39 a month' },
                { title: 'Collective', description: '$89 a month, several rooms' },
            ],
        },
    ],
};

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default: `I can help with classes, waitlists, passes, payouts and billing. Ask me anything, or say **talk to a person** and I’ll bring in the team.`,

    waitlist: {
        when: /waitlist|wait list|full class|class is full/i,
        turn: [{ tool: SEARCH_TOOL, input: { query: 'waitlist full class' } }],
    },
    refund: {
        when: /refund|money back/i,
        turn: [{ tool: SEARCH_TOOL, input: { query: 'refund pass' } }],
    },
    plan: {
        when: /plan|upgrade|downgrade|billing|pricing/i,
        turn: [{ tool: SEARCH_TOOL, input: { query: 'change plan' } }],
    },
    person: {
        when: /person|human|someone|agent|talk to/i,
        turn: [
            { text: 'Of course. I’ll bring in someone from Customer Care. They’ll see everything above, so you won’t have to repeat yourself.' },
            { tool: HANDOFF_TOOL, input: { reason: 'The visitor asked for a person.' } },
        ],
    },

    // After a search: what the articles say for the topic asked about (picked by `match`).
    found: { after: SEARCH_TOOL, turn: 'These articles should help. Tell me if anything in them is unclear.' },
    'found-waitlist': [
        { text: WAITLIST_ANSWER },
        { tool: 'ask_user', input: PLAN_QUESTION },
    ],
    'found-refund': 'Open **Members**, pick the student, then **Passes → Refund**. Unused credits come back in full; for a pass already in use you can refund part of it. The money reaches their card in 5 to 10 working days.',
    'found-plan': 'Go to **Settings → Plan** and pick the new plan. An upgrade starts at once and you pay the difference for the rest of the month; a downgrade starts at your next invoice.',

    // After the plan question (picked by `match` from the answer).
    answered: { after: 'ask_user', turn: 'Thanks. Your plan is under **Settings → Plan** if you need to check it.' },
    'plan-included': PLAN_INCLUDED,
    'plan-starter': 'Waitlists aren’t part of Starter. You can try **Studio** free for 14 days from **Settings → Plan**, and your classes keep their bookings when you switch.',
    'plan-skipped': 'No problem. Waitlists are on the Studio and Collective plans; you’ll find yours under **Settings → Plan**.',

    'handed-off': { after: HANDOFF_TOOL, turn: '' },

    screenshot: `Thanks for the screenshot. I’ve added it to this conversation, but I can’t read images myself. Say **talk to a person** and someone from the team will take a look.`,
};

function lastUserText(request: AparteChatRequest): string {
    const user = request.messages.findLast((message) => message.role === 'user');
    return user ? contentToText(user.content) : '';
}

/**
 * The choices the default rule cannot make. It routes a tool's result to the scenario that
 * declared `after` for it; which article summary or which plan answer follows depends on the
 * topic asked about, or on the answer given.
 */
export function match(request: AparteChatRequest, scenarios: Record<string, Scenario>): string | undefined {
    const last = request.messages[request.messages.length - 1];
    if (last?.role === 'user' && Array.isArray(last.content) && last.content.some((part) => part.type === 'image')) {
        return 'screenshot';
    }
    const route = defaultMatch(request, scenarios);
    if (route === 'found') {
        const asked = lastUserText(request);
        const topic = ['waitlist', 'refund', 'plan'].find((key) => (scenarios[key]?.when as RegExp).test(asked));
        return topic ? `found-${topic}` : undefined;
    }
    if (route === 'answered' && last) {
        const answer = contentToText(last.content);
        if (answer === 'Starter') return 'plan-starter';
        return answer === 'Studio' || answer === 'Collective' ? 'plan-included' : 'plan-skipped';
    }
    return undefined;
}

/** What a visitor sees before asking anything: the help center's articles on memberships. */
const POPULAR = helpSearch('membership pause');

/** The welcome every conversation opens on: a greeting and those articles, stamped with now. */
export function welcome(): AparteMessage {
    return {
        id: 'welcome',
        role: 'assistant',
        timestamp: Date.now(),
        segments: [
            {
                id: 'w1',
                type: 'text',
                content: `Hi, I’m **${ASSISTANT_NAME}**, the Kilnhouse assistant. I can answer questions about classes, passes and billing, or bring in a person from our team. We usually reply in under a minute.`,
            },
            {
                id: 'w2',
                type: 'tool_call',
                status: 'resolved',
                toolCall: { id: 'tw', name: SEARCH_TOOL, input: { query: POPULAR.query } },
                result: describeSearch(POPULAR),
                structuredResult: POPULAR,
            },
        ],
    };
}

/** What the landing's showcase types, once it is on screen. */
export const PLAY_QUESTION = 'Can students join a waitlist?';

const SEED_SEARCH = helpSearch('waitlist full class');

/** The conversation a tile shows, finished: it opens on the visitor's question, then the cards and the receipt. The lead-in sentence is left out so all of it fits the tile. */
export const SEED: AparteMessage[] = [
    { id: 'u1', role: 'user', content: PLAY_QUESTION, timestamp: Date.parse('2026-10-16T10:12:40') },
    {
        id: 'a1',
        role: 'assistant',
        timestamp: Date.parse('2026-10-16T10:12:42'),
        segments: [
            {
                id: 's1',
                type: 'tool_call',
                status: 'resolved',
                toolCall: { id: 't1', name: SEARCH_TOOL, input: { query: 'waitlist full class' } },
                result: describeSearch(SEED_SEARCH),
                structuredResult: SEED_SEARCH,
            },
            {
                id: 's3',
                type: 'tool_call',
                status: 'resolved',
                toolCall: { id: 't2', name: 'ask_user', input: PLAN_QUESTION },
                result: 'Studio',
                structuredResult: { action: 'accept', answers: [{ question: PLAN_QUESTION.questions[0]!.question, value: 'Studio' }] },
            },
            { id: 's4', type: 'text', content: PLAN_INCLUDED },
        ],
    },
];
