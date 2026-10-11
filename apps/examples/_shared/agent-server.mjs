/**
 * The examples' agent server — the loop on a server, for the browser suite.
 *
 * `createAparteAgentHandler` on a bare `node:http` server, running the SAME scripted
 * model the sites run in the page (`site-setup.ts`), with `get_weather` as a server tool
 * that needs a person. A site opened with `?agent=<this URL>` sends its turns here
 * instead of running the loop itself, and the approval travels across the network: the
 * run suspends, the page's panel answers, the run resumes. `e2e/tests/agent-loop.spec.ts`
 * drives it on all five sites.
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

createServer(async (req, res) => {
    // The sites run on their own ports: this is a cross-origin endpoint.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('aparté agent server'); return; }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
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
