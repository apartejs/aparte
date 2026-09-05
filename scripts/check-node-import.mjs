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
 *
 * "Run after `pnpm build`" used to be prose here too, and prose is not a precondition:
 * run standalone against a stale `dist/` this reports OK on a mistake it is designed to
 * catch — measured, not supposed. The freshness check below turns that sentence into a
 * failure with the command to fix it.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { distFreshness } from './dist-freshness.mjs';

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

/**
 * Every built package this file imports is newer than the source it was built from.
 *
 * Three guards in this repo read `dist/`, and a sabotage run proved all three return a
 * clean green against a stale build. In `pnpm gate` that is harmless — `pnpm build` is
 * step 7 — but a contributor running this after an edit gets a green that means nothing
 * at all, which is worse than no check.
 *
 * The comparison is `scripts/dist-freshness.mjs`, which is also what the repo-wide
 * `pnpm check:dist-freshness` step runs. Not a second copy on purpose: mtime alone gives
 * false alarms (a `git checkout` bumps it with identical bytes, twice observed), and the
 * hash fallback that fixes that already exists once.
 */
check('every built package is newer than its source', async () => {
    // Scoped to the packages this file actually imports. `distFreshness()` with no
    // argument walks all 20 publishable packages, and a stale wrapper is not a reason
    // for THIS check to red: the message below promises that every check here reads
    // the BUILT package, and it would then be naming a build none of them read.
    const dirs = [...new Set([
        'packages/core',
        'packages/engine',
        'packages/providers/ai/openai-compat',
        ...SATELLITES.map(([, dir]) => dir),
    ])];
    const { stale } = distFreshness({ dirs });
    assert.deepEqual(
        stale,
        [],
        `${stale.length} of the ${dirs.length} package(s) this file imports have a stale dist:\n`
        + `       ${stale.join('\n       ')}\n`
        + '       Every check below reads the BUILT package, so a green here would be judging\n'
        + '       a previous build. Rebuild with `npx nx run <project>:build --skip-nx-cache`.',
    );
});

/**
 * `@aparte/core/browser` is the browser build, by name.
 *
 * `.` resolves the `node` condition and must keep doing so — that is what makes
 * `import '@aparte/core'` safe in an SSR pass. But a TEST RUNNER is Node with a DOM, so
 * vitest + jsdom took the DOM-free entry, no `<aparte-*>` upgraded, and there was no
 * supported specifier to escape to: every wrapper in this repo had to alias
 * `@aparte/core` at `../../core/src/index.ts`, reaching into another package's source.
 *
 * The assertion is the throw, and that is deliberate: in a DOM-LESS Node this entry MUST
 * fail with `HTMLElement is not defined`, because that is the proof it points at the
 * entry with the elements in it. Assert only that it resolves and it could be silently
 * repointed at `dist/index.node.js` and stay green while helping nobody.
 */
check('@aparte/core/browser is the entry with the elements in it', async () => {
    assert.equal(typeof HTMLElement, 'undefined', 'this must run without a DOM');
    await assert.rejects(
        () => import('@aparte/core/browser'),
        (error) => {
            assert.match(
                String(error?.message),
                /HTMLElement is not defined/,
                'the browser entry must be the one that subclasses HTMLElement at module scope',
            );
            return true;
        },
    );
    // And the sibling that makes a test config able to compute a path to it at all.
    const { createRequire } = await import('node:module');
    const resolved = createRequire(import.meta.url).resolve('@aparte/core/package.json');
    assert.ok(resolved.endsWith('package.json'), '@aparte/core/package.json must be exported');
});

check('@aparte/engine imports and exposes the headless loop', async () => {
    const engine = await import('@aparte/engine');
    assert.equal(typeof engine.runStreamAgent, 'function');
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
 * The satellites were simply outside it. The list below is hand-kept, so a new
 * publishable package has to be added here the day it is created — `@aparte/provider-scenario`
 * shipped uncovered for exactly that reason.
 */
const SATELLITES = [
    ['@aparte/plugin-ask-user', 'packages/plugins/ask-user'],
    ['@aparte/plugin-approval', 'packages/plugins/approval'],
    ['@aparte/plugin-compaction', 'packages/plugins/compaction'],
    ['@aparte/plugin-titler', 'packages/plugins/titler'],
    ['@aparte/plugin-artifacts', 'packages/plugins/artifacts'],
    ['@aparte/plugin-model-selector', 'packages/plugins/model-selector'],
    ['@aparte/plugin-marked', 'packages/plugins/marked'],
    ['@aparte/plugin-shiki', 'packages/plugins/shiki'],
    ['@aparte/plugin-streaming-markdown', 'packages/plugins/streaming-markdown'],
    ['@aparte/provider-ai-sdk', 'packages/providers/ai/ai-sdk'],
    ['@aparte/provider-scenario', 'packages/providers/ai/scenario'],
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

/**
 * The two barrels export the same VALUES, checked at runtime.
 *
 * `check-node-barrel-types.mjs` diffs the two `.d.ts` files, which is the compile half.
 * This is the other one, and it is the check that would have caught the failure that
 * actually happened: `@aparte/plugin-artifacts`'s node barrel was missing
 * `buildSafePreviewDocument` and `PREVIEW_CSP`, and a consumer importing either on a
 * server got `SyntaxError: The requested module does not provide an export named …` —
 * a hard crash at import, not a type error.
 *
 * Only packages whose BROWSER entry can be evaluated in a DOM-less Node are compared,
 * and the ones that cannot are named with their reason rather than skipped in silence:
 * a barrel that defines a custom element at module scope throws `HTMLElement is not
 * defined` here BY DESIGN — that is what having a node entry is for.
 */
const BROWSER_ONLY_VALUES = new Set([
    // Builds the artifact card: elements, and a stylesheet read.
    'artifactRenderer',
]);

for (const [name, dir] of [
    ['@aparte/plugin-artifacts', 'packages/plugins/artifacts'],
]) {
    check(`${name}: the node barrel exports the same values as the browser one`, async () => {
        const read = async (spec) => {
            const mod = await import(pathToFileURL(resolve(process.cwd(), dir, spec)).href);
            return Object.keys(mod).filter((k) => k !== 'default').sort();
        };
        const browser = await read('./dist/index.js');
        const node = await read('./dist/index.node.js');
        assert.ok(browser.length > 5, `only ${browser.length} exports read from the browser barrel`);

        const missingFromNode = browser.filter((k) => !node.includes(k) && !BROWSER_ONLY_VALUES.has(k));
        assert.deepEqual(
            missingFromNode,
            [],
            `${missingFromNode.join(', ')} exist on the browser barrel and not the node one, so `
            + 'importing them on a server is a SyntaxError at module evaluation.',
        );
        const missingFromBrowser = node.filter((k) => !browser.includes(k));
        assert.deepEqual(
            missingFromBrowser,
            [],
            `${missingFromBrowser.join(', ')} exist only on the node barrel — every browser `
            + 'consumer, which is most of them, fails to import them.',
        );
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
