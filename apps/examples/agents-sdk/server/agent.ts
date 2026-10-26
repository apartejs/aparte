/**
 * The agent: the part an Agent Builder export gives you, as Agents SDK code.
 *
 * Agent Builder's Code → Agents SDK export is an `Agent` like this one — its instructions, its
 * tools, the model its workflow chose — and nothing about the page that draws it. That is the
 * point of the demo: this file does not change when the chat in front of it does.
 */
import { Agent, tool } from '@openai/agents';

/** Where an order is — the stand-in for the tools your workflow configured. */
export const getOrderStatus = tool({
    name: 'get_order_status',
    description: 'Look up where an order is, by its number.',
    parameters: {
        type: 'object',
        properties: {
            orderNumber: { type: 'string', description: 'The order number, such as 1042.' },
        },
        required: ['orderNumber'],
        additionalProperties: false,
    },
    strict: true,
    async execute(input) {
        const { orderNumber } = input as { orderNumber: string };
        return { orderNumber, status: 'shipped', carrier: 'La Poste', arrives: 'in 2 days' };
    },
});

export const supportAgent = new Agent({
    name: 'Support',
    instructions:
        'You answer questions about orders for a small online shop. Look an order up with '
        + 'get_order_status before saying where it is, and answer in one or two sentences.',
    tools: [getOrderStatus],
});
