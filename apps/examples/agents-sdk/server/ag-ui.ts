/**
 * An Agents SDK agent served over AG-UI: the bridge between what Agent Builder exports and any
 * chat that reads the open protocol.
 *
 * A Web `Request` in, a Web `Response` out, so it drops into a Next.js route, Hono, Deno, Bun
 * or a Worker as it is. The request is AG-UI's `RunAgentInput`; the response is AG-UI events
 * as server-sent events, one `data:` line each. The agent runs its loop and its tools here, on
 * the server, and the stream says what happened: the text as it is written, each tool call
 * with its arguments and its result.
 *
 * What it leaves out, on purpose: the history is rebuilt from the messages' text, so a tool
 * call from an earlier turn reaches the model as the reply that followed it, not as the call;
 * a person's images are dropped; and tools that ask for approval are not mapped to AG-UI's
 * interrupts.
 */
import { EventType, contentToText, type Event as AgUiEvent, type Message } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { assistant, user, type Agent, type AgentInputItem, type Runner } from '@openai/agents';

/** The conversation as the agent reads it: what was said, turn by turn. */
export function toAgentInput(messages: Message[]): AgentInputItem[] {
    const items: AgentInputItem[] = [];
    for (const message of messages) {
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        const text = contentToText(message.content as Parameters<typeof contentToText>[0]);
        if (!text) continue;
        items.push(message.role === 'user' ? user(text) : assistant(text));
    }
    return items;
}

function resultText(output: unknown): string {
    return typeof output === 'string' ? output : JSON.stringify(output);
}

export async function handleAgUi(request: Request, agent: Agent, runner: Runner): Promise<Response> {
    const parsed = RunAgentInputSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
        return new Response(`Not an AG-UI RunAgentInput: ${parsed.error.issues[0]?.message ?? 'unreadable body'}`, { status: 422 });
    }
    const { threadId, runId, messages } = parsed.data;
    const bytes = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;
            const send = (event: AgUiEvent) => {
                if (closed) return;
                try {
                    controller.enqueue(bytes.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                    closed = true; // the reader went away: stop writing, let the run wind down
                }
            };
            // A reply's text is one AG-UI message: opened on its first word, closed when the
            // model's response ends or a tool call comes between.
            let open: string | null = null;
            const closeText = () => {
                if (open) send({ type: EventType.TEXT_MESSAGE_END, messageId: open });
                open = null;
            };

            // Stop in the page aborts the request; the SDK ends the run early, and AG-UI says why.
            const cancelled = () => (request.signal.aborted ? { outcome: { type: 'cancelled' as const } } : {});

            send({ type: EventType.RUN_STARTED, threadId, runId });
            try {
                const result = await runner.run(agent, toAgentInput(messages as Message[]), { stream: true, signal: request.signal });
                for await (const event of result) {
                    if (event.type === 'raw_model_stream_event') {
                        if (event.data.type === 'output_text_delta' && event.data.delta) {
                            if (!open) {
                                open = crypto.randomUUID();
                                send({ type: EventType.TEXT_MESSAGE_START, messageId: open, role: 'assistant' });
                            }
                            send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: open, delta: event.data.delta });
                        } else if (event.data.type === 'response_done') {
                            closeText();
                        }
                    } else if (event.type === 'run_item_stream_event') {
                        const raw = event.item.rawItem;
                        if (event.name === 'tool_called' && raw.type === 'function_call') {
                            closeText();
                            send({ type: EventType.TOOL_CALL_START, toolCallId: raw.callId, toolCallName: raw.name });
                            send({ type: EventType.TOOL_CALL_ARGS, toolCallId: raw.callId, delta: raw.arguments });
                            send({ type: EventType.TOOL_CALL_END, toolCallId: raw.callId });
                        } else if (event.name === 'tool_output' && raw.type === 'function_call_result') {
                            const output = 'output' in event.item ? event.item.output : raw.output;
                            send({ type: EventType.TOOL_CALL_RESULT, messageId: crypto.randomUUID(), toolCallId: raw.callId, content: resultText(output) });
                        }
                    }
                }
                await result.completed;
                closeText();
                send({ type: EventType.RUN_FINISHED, threadId, runId, ...cancelled() });
            } catch (error) {
                closeText();
                if (request.signal.aborted) send({ type: EventType.RUN_FINISHED, threadId, runId, ...cancelled() });
                else send({ type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) });
            }
            if (!closed) controller.close();
        },
    });

    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}
