/**
 * A scripted AG-UI 1.0 run with two sub-agents, beside the real agent: what an agent framework
 * that delegates (an orchestrator and its workers) streams, replayed as written.
 *
 * The Agents SDK has no AG-UI sub-agents of its own, so this route does not run it: it plays the
 * events, one by one, `delayMs` apart. The support agent writes one sentence and calls
 * `delegate`, which opens the order tracker (`parentToolCallId`); the returns desk is started on
 * its own, with no call. The two work at the same time — their events interleave, each tagged
 * with its `subagentRunId` — and the support agent answers once both are back. The page's
 * `?subagents` sends its turns here (`src/main.ts`).
 */
import { RunAgentInputSchema } from '@ag-ui/core/schemas';

/** One AG-UI event, as it goes on the wire. */
export type ScriptedEvent = { type: string } & Record<string, unknown>;

/** The sub-agents' answers, and the support agent's: the reply holds the last one only. */
export const ORDER_ANSWER = 'Order 1042 shipped with La Poste; it arrives in 2 days.';
export const RETURNS_ANSWER = 'Returns are open for 30 days after delivery, so order 1042 can still go back.';
export const LEAD_IN = 'Two things to check, so two sub-agents: one on the order, one on the returns.';
export const REPLY = 'Order 1042 is on its way with La Poste and arrives in 2 days. Once it has, you have 30 days to send it back.';

/** A text message, from its start to its end, in a few deltas. */
function message(id: string, text: string, owner?: string): ScriptedEvent[][] {
    const by = owner ? { subagentRunId: owner } : {};
    const words = text.split(/(?<= )/);
    const deltas: ScriptedEvent[][] = [];
    for (let i = 0; i < words.length; i += 3) {
        deltas.push([{ type: 'TEXT_MESSAGE_CONTENT', messageId: id, delta: words.slice(i, i + 3).join(''), ...by }]);
    }
    return [[{ type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant', ...by }], ...deltas, [{ type: 'TEXT_MESSAGE_END', messageId: id, ...by }]];
}

/** A tool call the agent ran itself, as one frame: start, arguments, end. */
function call(id: string, name: string, args: object, owner?: string): ScriptedEvent[] {
    const by = owner ? { subagentRunId: owner } : {};
    return [
        { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: name, ...by },
        { type: 'TOOL_CALL_ARGS', toolCallId: id, delta: JSON.stringify(args), ...by },
        { type: 'TOOL_CALL_END', toolCallId: id, ...by },
    ];
}

/** Two lists of frames, one from each, while both last. */
function interleave(a: ScriptedEvent[][], b: ScriptedEvent[][]): ScriptedEvent[][] {
    const out: ScriptedEvent[][] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) out.push(a[i]!);
        if (b[i]) out.push(b[i]!);
    }
    return out;
}

/**
 * The run, as frames: each frame is sent at once, and the next one `delayMs` later. Ids are
 * prefixed with the run's, so a second turn in the same thread never reuses one.
 */
export function subagentRun(threadId: string, runId: string): ScriptedEvent[][] {
    const id = (name: string) => `${runId}-${name}`;
    const orders = id('orders');
    const returns = id('returns');
    const spawn = id('delegate');
    return [
        [{ type: 'RUN_STARTED', threadId, runId }],
        ...message(id('lead'), LEAD_IN),
        call(spawn, 'delegate', { agents: [{ name: 'Order tracker', task: 'Find where order 1042 is' }] }),
        [{ type: 'SUBAGENT_STARTED', subagentRunId: orders, name: 'Order tracker', description: 'Find where order 1042 is', parentToolCallId: spawn }],
        [{ type: 'SUBAGENT_STARTED', subagentRunId: returns, name: 'Returns desk', description: 'Check whether order 1042 can still be returned' }],
        ...interleave(
            [
                call(id('status'), 'get_order_status', { orderNumber: '1042' }, orders),
                [{ type: 'TOOL_CALL_RESULT', messageId: id('status-result'), toolCallId: id('status'), content: JSON.stringify({ orderNumber: '1042', status: 'shipped', carrier: 'La Poste', arrives: 'in 2 days' }), subagentRunId: orders }],
                ...message(id('orders-answer'), ORDER_ANSWER, orders),
                [{ type: 'SUBAGENT_FINISHED', subagentRunId: orders, result: ORDER_ANSWER }],
                [{ type: 'TOOL_CALL_RESULT', messageId: id('delegate-result'), toolCallId: spawn, content: ORDER_ANSWER }],
            ],
            [
                [],
                call(id('policy'), 'get_return_policy', { orderNumber: '1042' }, returns),
                [{ type: 'TOOL_CALL_RESULT', messageId: id('policy-result'), toolCallId: id('policy'), content: 'Returns are accepted for 30 days after delivery.', subagentRunId: returns }],
                ...message(id('returns-answer'), RETURNS_ANSWER, returns),
                [{ type: 'SUBAGENT_FINISHED', subagentRunId: returns, result: RETURNS_ANSWER }],
            ],
        ).filter((frame) => frame.length > 0),
        ...message(id('reply'), REPLY),
        [{ type: 'RUN_FINISHED', threadId, runId }],
    ];
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
    }
    signal.addEventListener('abort', done, { once: true });
});

/**
 * The route: AG-UI's `RunAgentInput` in, the scripted run out as server-sent events. Stop in the
 * page aborts the request, and the replay stops writing.
 */
export async function handleSubagentRun(request: Request, delayMs: number): Promise<Response> {
    const parsed = RunAgentInputSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
        return new Response(`Not an AG-UI RunAgentInput: ${parsed.error.issues[0]?.message ?? 'unreadable body'}`, { status: 422 });
    }
    const frames = subagentRun(parsed.data.threadId, parsed.data.runId);
    const bytes = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                for (const [i, frame] of frames.entries()) {
                    if (i > 0) await sleep(delayMs, request.signal);
                    if (request.signal.aborted) break;
                    for (const event of frame) controller.enqueue(bytes.encode(`data: ${JSON.stringify(event)}\n\n`));
                }
                controller.close();
            } catch {
                // the reader went away: nothing left to write to
            }
        },
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}
