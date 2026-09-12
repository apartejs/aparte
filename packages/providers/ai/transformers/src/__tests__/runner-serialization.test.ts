/**
 * "One pipeline per tab" is the invariant this worker exists to keep — a local
 * model is gigabytes, and two of them resident is the failure to avoid. Two ways
 * it broke, both from the 2026-09-05 audit, both reachable through the documented
 * `TransformersProvider.prepareModel`:
 *
 *  - a `prepare` for another model DISPOSED the runner an in-flight generate was
 *    using (with the real runner, that is `pipe.dispose()` on the ONNX session the
 *    running `pipe(...)` is executing — the generation the user is watching);
 *  - two `prepare`s in the same tick both saw `current === null` across the three
 *    awaits, so the second orphaned the first: two multi-GB models resident, the
 *    older one unreachable for cleanup.
 *
 * The main thread serialises its generates for exactly this reason; the worker now
 * serialises everything that touches the runner.
 */
import { describe, it, expect, vi } from 'vitest';
import { createWorkerHost, type WorkerHostDeps, type OutMessage } from '../worker-host.js';
import type { CreateRunner, TransformersRunner } from '../runners/types.js';

/** A runner factory that records every instance it builds and its lifetime. */
function trackedRunners(generate: (modelId: string) => Promise<void> | void) {
    const built: { modelId: string; disposed: boolean }[] = [];
    const alive = (): string[] => built.filter(r => !r.disposed).map(r => r.modelId);
    const createRunner: CreateRunner = async (ctx) => {
        const record = { modelId: ctx.modelId, disposed: false };
        built.push(record);
        const runner: TransformersRunner = {
            async generate() { await generate(ctx.modelId); },
            dispose() { record.disposed = true; },
        };
        return runner;
    };
    return { createRunner, built, alive };
}

function host(createRunner: CreateRunner) {
    const posted: OutMessage[] = [];
    const deps: WorkerHostDeps = {
        post: (m) => { posted.push(m); },
        loadTransformers: vi.fn(async () => ({ env: {} }) as never),
        importRunner: vi.fn(async () => ({ createRunner })),
    };
    return { h: createWorkerHost(deps), posted, flush: () => new Promise(r => setTimeout(r, 0)) };
}

const gen = (id: string, modelId: string) => ({
    type: 'generate' as const, id, modelId,
    messages: [{ role: 'user' as const, content: 'hi' }],
    options: {},
});

describe('the worker serialises everything that touches the runner', () => {
    it('a prepare for another model waits for the running generate', async () => {
        let release!: () => void;
        const running = new Promise<void>((r) => { release = r; });
        const { createRunner, built, alive } = trackedRunners(async (modelId) => {
            if (modelId === 'A') await running;
        });
        const { h, posted, flush } = host(createRunner);

        h.onMessage(gen('g1', 'A'));
        await flush();
        expect(alive()).toEqual(['A']);

        // The user picks another model while the reply streams.
        h.onMessage({ type: 'prepare', id: 'p1', modelId: 'B' });
        await flush();
        expect(built.find(r => r.modelId === 'A')!.disposed, 'A is generating; nothing may dispose it').toBe(false);
        expect(alive(), 'B must not be built beside A').toEqual(['A']);
        expect(posted.some(m => m.type === 'pipeline-ready' && m.modelId === 'B')).toBe(false);

        release();
        await flush();
        await flush();
        expect(posted.some(m => m.type === 'gen-done' && m.id === 'g1')).toBe(true);
        expect(alive(), 'B takes over once A is finished').toEqual(['B']);
    });

    it('nothing is posted for a generate after its runner was disposed', async () => {
        let release!: () => void;
        const running = new Promise<void>((r) => { release = r; });
        const { createRunner } = trackedRunners(async (modelId) => { if (modelId === 'A') await running; });
        const { h, posted, flush } = host(createRunner);

        h.onMessage(gen('g1', 'A'));
        await flush();
        h.onMessage({ type: 'prepare', id: 'p1', modelId: 'B' });
        await flush();

        const readyIndex = posted.findIndex(m => m.type === 'pipeline-ready' && m.modelId === 'B');
        expect(readyIndex, 'B cannot be announced while A generates').toBe(-1);
        release();
        await flush();
        await flush();
        // A's terminal message precedes B's arrival, in the posted order.
        const done = posted.findIndex(m => m.type === 'gen-done' && m.id === 'g1');
        const readyB = posted.findIndex(m => m.type === 'pipeline-ready' && m.modelId === 'B');
        expect(done).toBeGreaterThanOrEqual(0);
        expect(readyB).toBeGreaterThan(done);
    });

    it('two prepares in the same tick leave one runner, not two', async () => {
        const { createRunner, built, alive } = trackedRunners(() => { /* unused */ });
        const { h, flush } = host(createRunner);

        h.onMessage({ type: 'prepare', id: 'p1', modelId: 'A' });
        h.onMessage({ type: 'prepare', id: 'p2', modelId: 'B' });
        await flush();
        await flush();

        expect(built.map(r => r.modelId)).toEqual(['A', 'B']);
        expect(alive(), 'the first must be disposed, not orphaned').toEqual(['B']);
    });

    it('a command cannot switch the runner under a running generate either', async () => {
        let release!: () => void;
        const running = new Promise<void>((r) => { release = r; });
        const { createRunner, built } = trackedRunners(async (modelId) => { if (modelId === 'A') await running; });
        const { h, posted, flush } = host(createRunner);

        h.onMessage(gen('g1', 'A'));
        await flush();
        h.onMessage({ type: 'command', id: 'c1', modelId: 'B', name: 'noop', payload: null });
        await flush();
        expect(built.find(r => r.modelId === 'A')!.disposed).toBe(false);
        expect(posted.some(m => m.type === 'command-result')).toBe(false);

        release();
        await flush();
        await flush();
        expect(posted.some(m => m.type === 'command-result' && m.id === 'c1')).toBe(true);
    });
});
