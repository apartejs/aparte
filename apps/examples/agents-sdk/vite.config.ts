import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/** A Node request as a Web `Request`, aborted when the browser goes away. */
function toRequest(req: IncomingMessage, res: ServerResponse): Request {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableFinished) controller.abort(); });
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    return new Request(`http://localhost${req.url ?? '/'}`, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
        signal: controller.signal,
        ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
}

/** A Web `Response` written to Node, chunk by chunk, so the stream arrives as it is made. */
async function send(response: Response, res: ServerResponse): Promise<void> {
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    if (!response.body) return void res.end();
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
    res.end();
}

/**
 * Mounts `server/endpoint.ts` at `/agent` on the dev server, so `pnpm dev` is the page and the
 * agent in one process. Loaded through Vite on each request: an edit to the agent applies on
 * the next message.
 */
function agentEndpoint(): Plugin {
    return {
        name: 'agent-endpoint',
        configureServer(server: ViteDevServer) {
            server.middlewares.use('/agent', (req, res) => {
                void (async () => {
                    try {
                        const { handle } = await server.ssrLoadModule('/server/endpoint.ts') as { handle: (r: Request) => Promise<Response> };
                        await send(await handle(toRequest(req, res)), res);
                    } catch (error) {
                        server.config.logger.error(String(error));
                        if (!res.headersSent) res.statusCode = 500;
                        res.end();
                    }
                })();
            });
        },
    };
}

// Dev resolves @aparte/* from source, like the other examples — see apps/examples/vanilla.
export default defineConfig({
    plugins: [agentEndpoint()],
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
        alias: [{ find: '@aparte/core/styles.css', replacement: fileURLToPath(new URL('../../../packages/core/src/styles/bundle.css', import.meta.url)) }],
    },
});
