/**
 * The examples' agent server — the loop on a server, for the browser suite.
 *
 * `createAparteAgentHandler` on a bare `node:http` server, running the SAME scripted
 * model the sites run in the page (`site-setup.ts`), with `get_weather` as a server tool
 * that needs a person. A site opened with `?agent=<this URL>` sends its turns here
 * instead of running the loop itself, and the approval travels across the network: the
 * run suspends, the page's panel answers, the run resumes. `e2e/tests/agent-loop.spec.ts`
 * drives it on all five sites. `POST /agui` serves a scripted AG-UI agent for `?agui=<url>`,
 * `POST /agui/tanstack` the same lines on TanStack AI's real server, and `POST /n8n/…/chat`
 * a scripted n8n Chat Trigger for `?n8n=<url>`.
 *
 * The scripted model is written out a second time here, on purpose: this file runs in
 * Node, `site-setup.ts` is bundled TypeScript, and two copies of a dozen lines is below
 * the point where a shared module earns its place. Keep the two in step.
 *
 * Not an example to copy for production: `authorize` lets everyone in and the secret is
 * a constant. The guide "Run the loop on your server" shows the real thing.
 */
import { createServer } from 'node:http';
import { webcrypto } from 'node:crypto';
import { createAparteAgentHandler, contentToText } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { showcase } from '@aparte/provider-scenario/showcase';
import { EventSchemas, RunAgentInputSchema } from '@ag-ui/core/schemas';
import { chat, chatParamsFromRequest, mergeAgentTools, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

const PORT = Number(process.env.AGENT_PORT ?? 5399);

/** What a `tool` message says when the call did not run — mirrors `site-setup.ts`. */
const REFUSAL = /rejected by the user|rejected this tool call|refused by the approval policy|Plan mode:/;

const scripted = createScenarioProvider({
    scenarios: {
        ...showcase,
        refused: 'Understood — I have not run it. Tell me if you change your mind.',
    },
    match: (request) => {
        const last = request.messages[request.messages.length - 1];
        if (last?.role !== 'tool') return undefined;
        return REFUSAL.test(contentToText(last.content)) ? 'refused' : undefined;
    },
    models: [{ id: 'scripted', name: 'Scripted model', contextWindow: 8000, capabilities: ['streaming', 'function_calling'] }],
});

const handler = createAparteAgentHandler({
    providers: { scenario: scripted },
    authorize: () => true,
    secret: 'examples-agent-server-secret-not-for-production',
    crypto: webcrypto.subtle,
    tools: [{
        tool: {
            name: 'get_weather',
            description: 'Current weather for a city.',
            inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
            needsApproval: true,
        },
        handler: async (call) => ({ toolCallId: call.id, content: `Cloudy, 14 °C in ${String(call.input.city ?? 'Lille')}.` }),
    }],
});

/**
 * `POST /agui` — a scripted AG-UI agent, for `?agui=<url>` (`@aparte/runner-ag-ui`). It holds
 * no state: every decision is read off the `RunAgentInput`, as a real AG-UI server rebuilds
 * a paused run from the history it is sent. The same lines as the scripted model above:
 * the weather pauses on an approval INTERRUPT (the agent's own server tool), and `ask_user`
 * is left to the browser the plain AG-UI way — the run ends, the page answers with a `tool`
 * message.
 */
const ASK_MOOD = {
    questions: [{
        question: 'Which mood for your landing page?',
        header: 'Mood',
        options: [
            { title: 'Dark and quiet', description: 'ink, brass accents', recommended: true },
            { title: 'Light and warm', description: 'cream, soft contrast' },
            { title: 'Maximum contrast', description: 'strict black and white' },
        ],
    }],
};
const SAID = {
    checking: 'Let me check that for you.',
    weather: 'Cloudy, 14 °C, a little wind from the west — bring a jacket.',
    refused: 'Understood — I have not run it. Tell me if you change your mind.',
    asking: 'One thing first.',
    noted: 'Noted — I will go with that.',
};

function agUiEvents(input) {
    const { threadId, runId } = input;
    const events = [{ type: 'RUN_STARTED', threadId, runId }];
    let n = 0;
    const text = (delta) => {
        const messageId = `${runId}-text-${n++}`;
        events.push({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
        events.push({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta });
        events.push({ type: 'TEXT_MESSAGE_END', messageId });
    };
    const call = (toolCallId, toolCallName, args) => {
        events.push({ type: 'TOOL_CALL_START', toolCallId, toolCallName });
        events.push({ type: 'TOOL_CALL_ARGS', toolCallId, delta: JSON.stringify(args) });
        events.push({ type: 'TOOL_CALL_END', toolCallId });
    };
    const finish = (outcome) => events.push({ type: 'RUN_FINISHED', threadId, runId, ...(outcome ? { outcome } : {}) });

    const answer = input.resume?.[0];
    const last = input.messages?.at(-1);
    const said = String(last?.content ?? '');
    if (answer) {
        const toolCallId = answer.interruptId.replace(/^approve-/, '');
        if (answer.status === 'resolved' && answer.payload?.approved) {
            events.push({ type: 'TOOL_CALL_RESULT', messageId: `${runId}-result`, toolCallId, content: 'Cloudy, 14 °C in Lille.' });
            text(SAID.weather);
        } else {
            text(SAID.refused);
        }
        finish();
    } else if (last?.role === 'tool') {
        text(SAID.noted);
        finish();
    } else if (/weather|forecast/i.test(said)) {
        text(SAID.checking);
        const toolCallId = `${runId}-weather`;
        call(toolCallId, 'get_weather', { city: 'Lille' });
        finish({ type: 'interrupt', interrupts: [{ id: `approve-${toolCallId}`, reason: 'tool_call', toolCallId, message: 'Run get_weather?' }] });
    } else if (/question|ask me|colou?r scheme/i.test(said) && input.tools?.some((t) => t.name === 'ask_user')) {
        text(SAID.asking);
        call(`${runId}-ask`, 'ask_user', ASK_MOOD);
        finish();
    } else {
        text('Hello from an AG-UI agent.');
        finish();
    }
    return events;
}

/**
 * Both ends of the AG-UI wire checked against the protocol's own schemas (`@ag-ui/core`):
 * the `RunAgentInput` the page sent, and every event the script answers with. A shape
 * only this server accepts would make the browser suite pass against a dialect.
 */
function agUiProblem(input, events) {
    const request = RunAgentInputSchema.safeParse(input);
    if (!request.success) return `The RunAgentInput is not AG-UI: ${request.error.message}`;
    for (const event of events) {
        const checked = EventSchemas.safeParse(event);
        if (!checked.success) return `The scripted ${event.type} is not AG-UI: ${checked.error.message}`;
    }
    return undefined;
}

/** On TanStack AI's route, `get_weather` is its own server tool, behind an approval. */
const tanstackWeather = toolDefinition({
    name: 'get_weather',
    description: 'Current weather for a city.',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    needsApproval: true,
}).server(async (input) => `Cloudy, 14 °C in ${String(input?.city ?? 'Lille')}.`);

/**
 * `POST /agui/tanstack` — the same lines on TanStack AI's REAL server: `chat()` and
 * `toServerSentEventsResponse`, the route their docs write, over their scripted model. What
 * the script above imitates, this one does: one RUN_FINISHED per model step, a resumed
 * call's result before RUN_STARTED, `ask_user` as a client-tool interrupt. Stateless the
 * same way: the model's lines are chosen from the request.
 */
async function tanstackResponse(request) {
    const params = await chatParamsFromRequest(request);
    const answer = params.resume?.[0];
    const last = params.messages.at(-1);
    const said = typeof last?.content === 'string' ? last.content : '';
    const id = params.runId ?? 'run';
    let lines;
    if (answer && String(answer.interruptId).startsWith('client_tool_')) lines = [{ text: SAID.noted }];
    else if (answer) lines = [{ text: answer.status === 'resolved' && answer.payload?.approved ? SAID.weather : SAID.refused }];
    else if (/weather|forecast/i.test(said)) lines = [{ text: SAID.checking, toolCalls: [{ name: 'get_weather', input: { city: 'Lille' }, id: `${id}-weather` }] }];
    else if (/question|ask me/i.test(said)) lines = [{ text: SAID.asking, toolCalls: [{ name: 'ask_user', input: ASK_MOOD, id: `${id}-ask` }] }];
    else lines = [{ text: 'Hello from TanStack AI.' }];
    const model = fakeText();
    model.setResponses(lines);
    return toServerSentEventsResponse(chat({
        adapter: model,
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        parentRunId: params.parentRunId,
        resume: params.resume,
        tools: mergeAgentTools([tanstackWeather], params.tools),
    }));
}

/** A web `Response` onto the node one. */
async function send(res, response) {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
        for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
}

/**
 * `POST /n8n/<id>/chat` — a scripted n8n Chat Trigger, for `?n8n=<url>` (`@aparte/runner-n8n`).
 * It answers as n8n 2.35.7 does, the frames the runner's fixtures recorded: newline-delimited
 * JSON labelled `application/json`, `begin` / `item` / `end` for the AI Agent node, which keeps a
 * memory per `sessionId`. `/n8n/whole/chat` answers once, as *When Last Node Finishes* does; a
 * message that says "fail" ends on an `error` frame, as a model that is down does.
 */
const n8nSessions = new Map();

/** What is wrong with the body the page sent, held to what n8n's widget sends. */
function n8nProblem(body) {
    if (body?.action !== 'sendMessage') return 'action must be "sendMessage"';
    if (typeof body.sessionId !== 'string' || !body.sessionId) return 'sessionId is required';
    if (typeof body.chatInput !== 'string') return 'chatInput must be a string';
    return undefined;
}

function n8nFrame(type, extra = {}) {
    return `${JSON.stringify({ type, ...extra, metadata: { nodeId: 'agent', nodeName: 'AI Agent', itemIndex: 0, runIndex: 0, timestamp: Date.now() } })}\n`;
}

function n8nReply(res, url, body) {
    const heard = n8nSessions.get(body.sessionId) ?? [];
    heard.push(body.chatInput);
    n8nSessions.set(body.sessionId, heard);
    const answer = `n8n heard **${body.chatInput}**, message ${heard.length} of this session.`;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (url.startsWith('/n8n/whole')) { res.end(JSON.stringify({ output: answer })); return; }
    res.write(n8nFrame('begin'));
    if (/fail/i.test(body.chatInput)) { res.end(n8nFrame('error', { content: 'The model is down (scripted failure).' })); return; }
    for (const piece of answer.match(/[\s\S]{1,8}/g) ?? []) res.write(n8nFrame('item', { content: piece }));
    res.end(n8nFrame('end'));
}

createServer(async (req, res) => {
    // The sites run on their own ports: this is a cross-origin endpoint.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, accept');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('aparté agent server'); return; }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.url?.startsWith('/n8n')) {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = undefined; }
        const problem = n8nProblem(body);
        if (problem) { res.writeHead(422, { 'Content-Type': 'text/plain' }).end(problem); return; }
        n8nReply(res, req.url, body);
        return;
    }
    if (req.url?.startsWith('/agui/tanstack')) {
        const body = Buffer.concat(chunks).toString('utf8');
        const problem = agUiProblem(JSON.parse(body), []);
        if (problem) { res.writeHead(422, { 'Content-Type': 'text/plain' }).end(problem); return; }
        await send(res, await tanstackResponse(new Request(`http://localhost:${PORT}${req.url}`, { method: 'POST', body })));
        return;
    }
    if (req.url?.startsWith('/agui')) {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const events = agUiEvents(input);
        const problem = agUiProblem(input, events);
        if (problem) { res.writeHead(422, { 'Content-Type': 'text/plain' }).end(problem); return; }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.end();
        return;
    }
    const disconnect = new globalThis.AbortController();
    res.on('close', () => { if (!res.writableFinished) disconnect.abort(); });

    const response = await handler(new Request(`http://localhost:${PORT}${req.url}`, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
        body: Buffer.concat(chunks),
        signal: disconnect.signal,
    }));
    await send(res, response);
}).listen(PORT, () => console.log(`[agent-server] listening on http://localhost:${PORT}/api/agent`));
