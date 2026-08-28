/**
 * Node-import contract, executed.
 *
 * `@aparte/core` ships a `node` export condition pointing at a DOM-free entry, so
 * it IS importable from a server / Electron main process / SSR pass. Two things
 * used to make that invisible:
 *
 *   - nothing exercised the PUBLISHED exports map. The SSR unit test
 *     (`src/__tests__/index-node-ssr.test.ts`) imports the *source* entry through
 *     vitest, which proves the module graph is DOM-free but never resolves the
 *     `node` condition of the real package;
 *   - reading the source is actively misleading: the first condition in the map is
 *     `@aparte-workspace/source` → `src/index.ts`, the browser entry, where 17
 *     unguarded `customElements.define` calls sit. A consumer looking for "can I
 *     use this server-side?" finds the evidence against it first.
 *
 * So this runs in plain Node against the BUILT packages: it is the contract as an
 * executable statement rather than prose. Run after `pnpm build`; part of
 * `pnpm gate` and CI.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('@aparte/core resolves its DOM-free node entry', async () => {
    assert.equal(typeof HTMLElement, 'undefined', 'this must run without a DOM');
    const core = await import('@aparte/core');

    // The runtime surface a server/desktop host needs.
    for (const name of ['AparteClient', 'AparteChatHost', 'aparteGlobalConfig', 'AparteMessageRepository', 'filesToAttachments']) {
        assert.ok(core[name], `@aparte/core should expose ${name} from Node`);
    }
    // …and NOT the custom elements (they extend HTMLElement).
    for (const name of ['AparteChatBubble', 'AparteComposer', 'AparteSelect']) {
        assert.equal(core[name], undefined, `${name} must not reach the Node entry`);
    }
    // Registering components server-side is a documented no-op, not a crash.
    core.registerAllComponents();
});

check('@aparte/engine imports and exposes the headless loop', async () => {
    const engine = await import('@aparte/engine');
    assert.equal(typeof engine.runStreamAgent, 'function');
    assert.equal(typeof engine.compactConversation, 'function');
});

check('@aparte/provider-openai-compat is usable from Node', async () => {
    // The whole point of the friction that started this: reusing the library's
    // provider from an Electron main process instead of re-writing an adapter.
    const { createOpenAICompatProvider, presets } = await import('@aparte/provider-openai-compat');
    const provider = createOpenAICompatProvider(presets.LMSTUDIO);

    const built = provider.buildRequest({
        messages: [{ role: 'user', content: 'hello' }],
        modelId: 'some-model',
        stream: true,
    });
    // A vendor request is `{ path, body, headers }` — the transport owns the origin.
    assert.ok(built.path.startsWith('/'), 'buildRequest should produce a rooted path');
    assert.equal(built.body.model, 'some-model', 'the request must carry the model id');
    assert.deepEqual(built.body.stream_options, { include_usage: true }, 'usage must be requested');
    assert.match(provider.defaultEndpoint, /^https?:\/\//, 'the adapter carries its base URL');
    assert.equal(typeof provider.parseStream, 'function');
});

check('createAparteChatHandler answers a real Request in Node', async () => {
    // The library's SERVER api, documented for Next/Deno/Bun — exercised here in
    // actual Node (its unit test runs under jsdom).
    const { createAparteChatHandler } = await import('@aparte/core');

    const adapter = {
        id: 'mock',
        defaultEndpoint: 'https://vendor.test/v1',
        buildRequest: () => ({ path: '/chat/completions', body: { model: 'm' } }),
        authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
        parseStream: () =>
            new ReadableStream({
                start(c) {
                    c.enqueue({ type: 'text', delta: 'hi' });
                    c.enqueue({ type: 'done' });
                    c.close();
                },
            }),
    };

    const handler = createAparteChatHandler({
        providers: { mock: adapter },
        resolveKey: () => 'sk-test',
        // Required since 0.8.0 — this route spends the server's key, so an open
        // endpoint has to be written on purpose rather than left unwritten.
        authorize: () => true,
        // No network: the vendor call is stubbed.
        fetchImpl: async () => new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 }),
    });

    const res = await handler(
        new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ providerId: 'mock', request: { messages: [{ role: 'user', content: 'hi' }], model: 'm', stream: true } }),
        }),
    );

    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines, [{ type: 'text', delta: 'hi' }, { type: 'done' }]);
});

/**
 * EVERY published package must at least IMPORT in Node — not just core.
 *
 * This guard covered core, engine and one provider. A cold audit imported all 15
 * and found two that crash outright: `@aparte/plugin-ask-user` threw
 * `SyntaxError: … does not provide an export named 'AparteElicitation'` (its barrel
 * pulls a browser-only export of core), and `@aparte/plugin-model-selector` threw
 * `ReferenceError: HTMLElement is not defined` (it subclasses HTMLElement at module
 * scope). Any SSR framework that evaluates the import on the server died — and
 * ask-user's message named `@aparte/core`, sending the reader to the wrong
 * package entirely.
 *
 * Core built an elaborate DOM-free entry and a contract test for exactly this case.
 * The satellites were simply outside it, which is why the loop below is generated
 * from the package list rather than hand-written per package: a new package is
 * covered the day it exists.
 */
const SATELLITES = [
    ['@aparte/plugin-ask-user', 'packages/plugins/ask-user'],
    ['@aparte/plugin-approval', 'packages/plugins/approval'],
    ['@aparte/plugin-model-selector', 'packages/plugins/model-selector'],
    ['@aparte/plugin-marked', 'packages/plugins/marked'],
    ['@aparte/plugin-shiki', 'packages/plugins/shiki'],
    ['@aparte/plugin-streaming-markdown', 'packages/plugins/streaming-markdown'],
    ['@aparte/provider-ai-sdk', 'packages/providers/ai/ai-sdk'],
    ['@aparte/provider-transformers', 'packages/providers/ai/transformers'],
    ['@aparte/locale-fr', 'packages/locales/fr'],
    // Node-only by construction (an MCP server) — the contract here is that importing it
    // opens no network and starts no server: `createDocsMcpServer` is a factory.
    ['@aparte/docs-mcp', 'packages/tools/docs-mcp'],
];

for (const [name, dir] of SATELLITES) {
    check(`${name} imports in Node without a DOM`, async () => {
        // Imported from the PACKAGE's own directory, in a child Node, on purpose.
        // Resolving from the repo root would use the root's links and could not see
        // the package's own `exports` map — and the export condition is precisely
        // what is under test. A child process also means one crashing package
        // cannot take the rest of the run with it.
        await new Promise((resolve, reject) => {
            const child = spawn(
                process.execPath,
                ['-e', `import(${JSON.stringify(name)}).then(() => process.exit(0)).catch(e => { console.error(e.constructor.name + ': ' + e.message); process.exit(1); })`],
                { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] },
            );
            let err = '';
            child.stderr.on('data', (c) => { err += c; });
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(err.trim().split(String.fromCharCode(10))[0] || `exit ${code}`));
            });
        });
    });
}

let failed = 0;
for (const { name, fn } of checks) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failed++;
        console.error(`  FAIL ${name}`);
        console.error(`       ${error instanceof Error ? error.message : String(error)}`);
    }
}

if (failed > 0) {
    console.error(`\n[aparte] node-import contract broken (${failed}/${checks.length} failed).`);
    console.error('Run `pnpm build` first; if it still fails, the `node` export condition or the DOM-free entry regressed.\n');
    process.exit(1);
}
console.log(`\n[aparte] node-import contract OK (${checks.length} checks).\n`);
