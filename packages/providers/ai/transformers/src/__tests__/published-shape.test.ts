/**
 * The shape a consumer's bundler has to be able to see.
 *
 * `_spawnWorker` carries a comment saying the literal
 * `new Worker(new URL('./worker.js', import.meta.url))` "is not style": it is the
 * exact pattern Vite's worker detection and webpack's WorkerPlugin match on, and
 * matching it is what makes a CONSUMER's bundler process the worker as a module —
 * which is the only reason `import('@huggingface/transformers')` inside the worker
 * ever resolves.
 *
 * The published bytes had stopped carrying it. The build handed the emit to Vite's
 * own worker plugin, which rewrote the call to
 *
 *     new Worker(new URL(\/* @vite-ignore *\/ "" + new URL("assets/worker-<hash>.js",
 *                        import.meta.url).href, import.meta.url), { type: "module" })
 *
 * — nothing static left to detect. So a bundled app copied the chunk as an opaque
 * asset without processing it, and every model load died on a bare specifier the
 * browser cannot resolve. The source said one thing and the artifact said another,
 * and no test read the artifact.
 *
 * This one does. It is the only kind of test that could have caught it: the defect
 * exists exclusively in the build output.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const INDEX = join(DIST, 'index.js');
const WORKER = join(DIST, 'worker.js');

beforeAll(() => {
    // This suite reads the artifact, so a missing one is a setup failure and must say
    // so rather than fail four assertions with an unhelpful message.
    expect(
        existsSync(INDEX),
        `${INDEX} is missing — run \`pnpm -C packages/providers/ai/transformers build\` first`,
    ).toBe(true);
});

describe('the published provider ships its worker where a bundler can find it', () => {
    it('publishes the worker at a stable dist/worker.js', () => {
        // Stable, not hashed: the name is part of the contract now, because the
        // literal below has to be written by a human and cannot contain a hash.
        expect(existsSync(WORKER)).toBe(true);
    });

    it('constructs it from the literal both Vite and webpack detect', () => {
        const index = readFileSync(INDEX, 'utf8');
        expect(index).toMatch(
            /new Worker\(\s*new URL\(\s*['"]\.\/worker\.js['"]\s*,\s*import\.meta\.url\s*\)/,
        );
    });

    it('does not inline the worker, nor point at a hashed asset copy', () => {
        const index = readFileSync(INDEX, 'utf8');
        // The two shapes this regressed into, both of which a consumer's bundler walks
        // straight past: an emitted `assets/worker-<hash>.js` referenced through a
        // string concatenation, and — when the URL was moved out of the `new Worker`
        // call without disabling Vite's asset transform — the worker's raw TypeScript
        // inlined as a `data:` URL.
        expect(index).not.toMatch(/assets\/worker-/);
        expect(index).not.toMatch(/new Worker\(new URL\("data:/);
    });

    it('keeps the worker self-sufficient: relative runners, one bare peer', () => {
        // A verbatim copy of `dist/` must run. The runner chunks are reached by
        // relative specifier so they follow the worker wherever it is served from;
        // `@huggingface/transformers` is the one bare specifier, and it is the peer
        // the consumer installed. `check:bundle-entries` asserts the same thing
        // transitively, on every chunk this one reaches.
        const worker = readFileSync(WORKER, 'utf8');
        const specs = [...worker.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]!);
        expect(specs).toContain('@huggingface/transformers');
        for (const spec of specs) {
            if (spec === '@huggingface/transformers') continue;
            expect(spec, `${spec} is neither the peer nor a relative sibling`).toMatch(/^\.\.?\//);
            expect(existsSync(join(DIST, spec.replace(/^\.\//, '')))).toBe(true);
        }
    });
});
