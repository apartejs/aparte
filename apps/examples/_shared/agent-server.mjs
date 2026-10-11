/**
 * The examples' agent server — the loop on a server, for the browser suite.
 *
 * `createAparteAgentHandler` on a bare `node:http` server, running the SAME scripted
 * model the sites run in the page (`site-setup.ts`), with `get_weather` as a server tool
 * that needs a person. A site opened with `?agent=<this URL>` sends its turns here
 * instead of running the loop itself, and the approval travels across the network: the
 * run suspends, the page's panel answers, the run resumes. `e2e/tests/agent-loop.spec.ts`
 * drives it on all five sites. `POST /agui` serves a scripted AG-UI agent for `?agui=<url>`.
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
            text('Cloudy, 14 °C, a little wind from the west — bring a jacket.');
        } else {
            text('Understood — I have not run it. Tell me if you change your mind.');
        }
        finish();
    } else if (last?.role === 'tool') {
        text('Noted — I will go with that.');
        finish();
    } else if (/weather|forecast/i.test(said)) {
        text('Let me check that for you.');
        const toolCallId = `${runId}-weather`;
        call(toolCallId, 'get_weather', { city: 'Lille' });
        finish({ type: 'interrupt', interrupts: [{ id: `approve-${toolCallId}`, reason: 'tool_call', toolCallId, message: 'Run get_weather?' }] });
    } else if (/question|ask me|colou?r scheme/i.test(said) && input.tools?.some((t) => t.name === 'ask_user')) {
        text('One thing first.');
        call(`${runId}-ask`, 'ask_user', {
            questions: [{
                question: 'Which mood for your landing page?',
                header: 'Mood',
                options: [
                    { title: 'Dark and quiet', description: 'ink, brass accents', recommended: true },
                    { title: 'Light and warm', description: 'cream, soft contrast' },
                    { title: 'Maximum contrast', description: 'strict black and white' },
                ],
            }],
        });
        finish();
    } else {
        text('Hello from an AG-UI agent.');
        finish();
    }
    return events;
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
    if (req.url?.startsWith('/agui')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        for (const event of agUiEvents(JSON.parse(Buffer.concat(chunks).toString('utf8')))) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
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
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
        for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
}).listen(PORT, () => console.log(`[agent-server] listening on http://localhost:${PORT}/api/agent`));
