/**
 * A TanStack AI 1.0 agent with two sub-agents, served over AG-UI: TanStack's own server code
 * from end to end — `chat()` with a `subagents` router, each sub-agent a `chat()` of its own
 * with a real tool, `toServerSentEventsResponse` for the wire. Only the models' words are
 * scripted, on TanStack's `fakeText`, so it runs with no key.
 *
 * The router splits the turn in two steps: the order tracker first, the returns desk after it
 * (it reads what the tracker found). Each calls its tool and answers; then, `handoff`, the main
 * model writes the reply from what they said. TanStack puts the router's plan on each
 * sub-agent's `SUBAGENT_STARTED` (`metadata.tanstack.subagentPlan`) and tags every event a
 * sub-agent streams with its `subagentRunId`. The page's `?tanstack` sends its turns here.
 */
import { chat, chatParamsFromRequest, defineAgent, toServerSentEventsResponse, toolDefinition, type AnyServerTool } from '@tanstack/ai';
import { fakeText, type FakeResponse } from '@tanstack/ai/testing';

/** What each one answers: the sub-agents' words go on their lines, the reply holds the last one only. */
export const ORDER_ANSWER = 'Order 1042 shipped with La Poste; it arrives in 2 days.';
export const RETURNS_ANSWER = 'Returns are open for 30 days after delivery, so order 1042 can still go back.';
export const REPLY = 'Order 1042 is on its way with La Poste and arrives in 2 days. Once it has, you have 30 days to send it back.';

export const TRACKER = 'Order tracker';
export const DESK = 'Returns desk';

const getOrderStatus = toolDefinition({
    name: 'get_order_status',
    description: 'Where an order is: its status, its carrier, when it arrives.',
    inputSchema: { type: 'object', properties: { orderNumber: { type: 'string' } }, required: ['orderNumber'] },
}).server(async (input: unknown) => ({
    orderNumber: (input as { orderNumber: string }).orderNumber,
    status: 'shipped',
    carrier: 'La Poste',
    arrives: 'in 2 days',
}));

const getReturnPolicy = toolDefinition({
    name: 'get_return_policy',
    description: 'How long an order can still be sent back.',
    inputSchema: { type: 'object', properties: { orderNumber: { type: 'string' } }, required: ['orderNumber'] },
}).server(async () => 'Returns are accepted for 30 days after delivery.');

/** TanStack's scripted model, at the demo's pace: `delayMs` per four characters. */
function model(delayMs: number, responses: FakeResponse[]) {
    const fake = fakeText(delayMs > 0 ? { tokensPerSecond: 1000 / delayMs } : {});
    fake.setResponses(responses);
    return fake;
}

/** A sub-agent: a `chat()` of its own, with its tool, that calls it once and answers. */
function subagent(name: string, task: string, tool: AnyServerTool, answer: string, delayMs: number) {
    return defineAgent({
        name,
        description: task,
        run: (ctx) => chat({
            adapter: model(delayMs, [
                { toolCalls: [{ name: tool.name, input: { orderNumber: '1042' } }] },
                { text: answer },
            ]),
            messages: ctx.messages,
            tools: [tool],
            ...ctx.forward,
        }),
    });
}

/** The two steps the router picks: one agent each, the second after the first. */
export const PLAN = { steps: [{ names: [TRACKER] }, { names: [DESK] }] };

/**
 * The route: AG-UI's `RunAgentInput` in, TanStack's AG-UI stream out. A body that is not one
 * comes back as TanStack's own 400.
 */
export async function handleTanstackRun(request: Request, delayMs: number): Promise<Response> {
    let params: Awaited<ReturnType<typeof chatParamsFromRequest>>;
    try {
        params = await chatParamsFromRequest(request);
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }
    // Stop in the page aborts the request; the run, its sub-agents and the stream stop with it.
    const abortController = new AbortController();
    request.signal.addEventListener('abort', () => abortController.abort(), { once: true });
    const stream = chat({
        adapter: model(delayMs, [{ text: REPLY }]),
        abortController,
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        ...(params.resume ? { resume: params.resume } : {}),
        subagents: {
            agents: [
                subagent(TRACKER, 'Find where order 1042 is', getOrderStatus, ORDER_ANSWER, delayMs),
                subagent(DESK, 'Check whether order 1042 can still be returned', getReturnPolicy, RETURNS_ANSWER, delayMs),
            ],
            router: () => PLAN,
            strategy: 'handoff',
        },
    });
    return toServerSentEventsResponse(stream, { abortController });
}
