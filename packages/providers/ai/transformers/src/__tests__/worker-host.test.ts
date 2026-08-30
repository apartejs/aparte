/**
 * The worker's logic, without a Worker: `createWorkerHost` takes its three seams as
 * dependencies — how to post, how to load Transformers.js, how to import a runner — so
 * the protocol can be exercised here with fakes, where the real worker and the real
 * model never load.
 *
 * What is asserted is the RUNNER SEAM: which runner a message selects (built-in by
 * `task`, a custom module by `runner`), that the runner sees the messages WITH their
 * parts, that its events travel as `gen-event`, that `done`/`error` are the host's to
 * close, that a warning travels once, that cancel aborts the signal, that a command
 * round-trips, and that a model or runner switch disposes the previous one.
 */
import { describe, it, expect, vi } from 'vitest';
import { createWorkerHost, type WorkerHostDeps } from '../worker-host.js';
import type { CreateRunner, TransformersRunner, RunnerContext, RunnerGenerateInput } from '../runners/types.js';

/** A runner whose behaviour the test scripts, and which records what it was given. */
function scriptedRunner(script: (input: RunnerGenerateInput, ctx: RunnerContext) => Promise<void> | void) {
    const seen: { ctx?: RunnerContext; inputs: RunnerGenerateInput[]; commands: [string, unknown][]; disposed: number } = { inputs: [], commands: [], disposed: 0 };
    const createRunner: CreateRunner = async (ctx) => {
        seen.ctx = ctx;
        const runner: TransformersRunner = {
            async generate(input) { seen.inputs.push(input); await script(input, ctx); },
            async command(name, payload) { seen.commands.push([name, payload]); return { echoed: payload }; },
            dispose() { seen.disposed++; },
        };
        return runner;
    };
    return { createRunner, seen };
}

function host(createRunner: CreateRunner, extra: Partial<WorkerHostDeps> = {}) {
    const posted: unknown[] = [];
    const importRunner = vi.fn(async () => ({ createRunner }));
    const deps: WorkerHostDeps = {
        post: (m) => { posted.push(m); },
        loadTransformers: vi.fn(async () => ({ env: {} }) as never),
        importRunner,
        ...extra,
    };
    const h = createWorkerHost(deps);
    const flush = () => new Promise((r) => setTimeout(r, 0));
    return { h, posted, importRunner, flush, deps };
}

const gen = (id: string, over: Record<string, unknown> = {}) => ({
    type: 'generate' as const, id, modelId: 'm1',
    messages: [{ role: 'user' as const, content: 'hi' }],
    options: {},
    ...over,
});

describe('createWorkerHost — selecting the runner', () => {
    it('with no task, loads the built-in text-generation runner', async () => {
        const { createRunner } = scriptedRunner(({ emit }) => { emit({ type: 'text', delta: 'ok' }); });
        const { h, importRunner, flush } = host(createRunner);
        h.onMessage(gen('g1'));
        await flush();
        expect(importRunner).toHaveBeenCalledWith({ task: 'text-generation', runner: undefined });
    });

    it('task: image-text-to-text asks for that built-in', async () => {
        const { createRunner } = scriptedRunner(() => {});
        const { h, importRunner, flush } = host(createRunner);
        h.onMessage(gen('g1', { task: 'image-text-to-text' }));
        await flush();
        expect(importRunner).toHaveBeenCalledWith({ task: 'image-text-to-text', runner: undefined });
    });

    it('a custom runner URL wins over task', async () => {
        const { createRunner } = scriptedRunner(() => {});
        const { h, importRunner, flush } = host(createRunner);
        h.onMessage(gen('g1', { task: 'text-generation', runner: 'https://app.example/runner.js' }));
        await flush();
        expect(importRunner).toHaveBeenCalledWith({ task: 'text-generation', runner: 'https://app.example/runner.js' });
    });

    it('hands the runner the resolved Transformers.js module, the model, dtype and device', async () => {
        const { createRunner, seen } = scriptedRunner(() => {});
        const tf = { env: {}, marker: 'the module' };
        const { h, flush } = host(createRunner, { loadTransformers: vi.fn(async () => tf as never) });
        h.onMessage(gen('g1', { dtype: 'q4', device: 'webgpu' }));
        await flush();
        expect(seen.ctx?.transformers).toBe(tf);
        expect(seen.ctx?.modelId).toBe('m1');
        expect(seen.ctx?.dtype).toBe('q4');
        expect(seen.ctx?.device).toBe('webgpu');
    });
});

describe('createWorkerHost — the generate round trip', () => {
    it('the runner sees the messages WITH their content parts', async () => {
        const { createRunner, seen } = scriptedRunner(() => {});
        const { h, flush } = host(createRunner);
        const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'what is this?' }, { type: 'image' as const, image: 'data:image/png;base64,AAAA' }] }];
        h.onMessage(gen('g1', { messages }));
        await flush();
        expect(seen.inputs[0]?.messages).toEqual(messages);
    });

    it('forwards text and thinking events as gen-event, and closes with gen-done carrying the usage', async () => {
        const { createRunner } = scriptedRunner(({ emit }) => {
            emit({ type: 'thinking', delta: 'hm' });
            emit({ type: 'text', delta: 'Hello' });
            emit({ type: 'done', usage: { inputTokens: 3, outputTokens: 1 } });
        });
        const { h, posted, flush } = host(createRunner);
        h.onMessage(gen('g1'));
        await flush();
        expect(posted).toEqual([
            { type: 'pipeline-ready', modelId: 'm1' },
            { type: 'gen-event', id: 'g1', event: { type: 'thinking', delta: 'hm' } },
            { type: 'gen-event', id: 'g1', event: { type: 'text', delta: 'Hello' } },
            { type: 'gen-done', id: 'g1', usage: { inputTokens: 3, outputTokens: 1 } },
        ]);
    });

    it('a runner that emits no done still gets a gen-done from the host', async () => {
        const { createRunner } = scriptedRunner(({ emit }) => { emit({ type: 'text', delta: 'x' }); });
        const { h, posted, flush } = host(createRunner);
        h.onMessage(gen('g1'));
        await flush();
        expect(posted.at(-1)).toEqual({ type: 'gen-done', id: 'g1' });
    });

    it('a runner error becomes gen-error, whether emitted or thrown', async () => {
        const emitted = scriptedRunner(({ emit }) => { emit({ type: 'error', message: 'boom' }); });
        const a = host(emitted.createRunner);
        a.h.onMessage(gen('g1'));
        await a.flush();
        expect(a.posted.at(-1)).toEqual({ type: 'gen-error', id: 'g1', message: 'boom' });

        const thrown = scriptedRunner(() => { throw new Error('crash'); });
        const b = host(thrown.createRunner);
        b.h.onMessage(gen('g2'));
        await b.flush();
        expect(b.posted.at(-1)).toEqual({ type: 'gen-error', id: 'g2', message: 'crash' });
    });

    it('cancel aborts the signal the runner was given', async () => {
        let aborted = false;
        const { createRunner } = scriptedRunner(({ signal }) => new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => { aborted = true; resolve(); });
        }));
        const { h, flush } = host(createRunner);
        h.onMessage(gen('g1'));
        await flush();
        expect(aborted).toBe(false);
        h.onMessage({ type: 'cancel', id: 'g1' });
        await flush();
        expect(aborted).toBe(true);
    });

    it('a warning travels to the main thread once per distinct message', async () => {
        const { createRunner } = scriptedRunner((_input, ctx) => {
            ctx.warn('images dropped');
            ctx.warn('images dropped');
            ctx.warn('tools dropped');
        });
        const { h, posted, flush } = host(createRunner);
        h.onMessage(gen('g1'));
        await flush();
        const warnings = posted.filter((m) => (m as { type: string }).type === 'warning');
        expect(warnings).toEqual([
            { type: 'warning', message: 'images dropped' },
            { type: 'warning', message: 'tools dropped' },
        ]);
    });
});

describe('createWorkerHost — prepare, command, and the runner cache', () => {
    it('prepare loads the runner, announces pipeline-ready, then ready', async () => {
        const { createRunner } = scriptedRunner(() => {});
        const { h, posted, flush } = host(createRunner);
        h.onMessage({ type: 'prepare', id: 'p1', modelId: 'm1' });
        await flush();
        expect(posted).toEqual([
            { type: 'pipeline-ready', modelId: 'm1' },
            { type: 'progress', id: 'p1', status: 'ready' },
        ]);
    });

    it('a failed load is a prepare-error', async () => {
        const { h, posted, flush } = host(async () => { throw new Error('no such model'); });
        h.onMessage({ type: 'prepare', id: 'p1', modelId: 'nope' });
        await flush();
        expect(posted).toEqual([{ type: 'prepare-error', id: 'p1', message: 'no such model' }]);
    });

    it('command reaches the runner and its result comes back under the same id', async () => {
        const { createRunner, seen } = scriptedRunner(() => {});
        const { h, posted, flush } = host(createRunner);
        h.onMessage({ type: 'command', id: 'c1', modelId: 'm1', name: 'adapter', payload: { name: 'poet' } });
        await flush();
        expect(seen.commands).toEqual([['adapter', { name: 'poet' }]]);
        expect(posted.at(-1)).toEqual({ type: 'command-result', id: 'c1', result: { echoed: { name: 'poet' } } });
    });

    it('a runner without command answers the command with an error, not silence', async () => {
        const createRunner: CreateRunner = async () => ({ async generate() {} });
        const { h, posted, flush } = host(createRunner);
        h.onMessage({ type: 'command', id: 'c1', modelId: 'm1', name: 'x', payload: null });
        await flush();
        expect(posted.at(-1)).toMatchObject({ type: 'command-result', id: 'c1', error: expect.stringContaining('command') });
    });

    it('the same model and runner reuse one instance; a different model disposes the previous', async () => {
        const { createRunner, seen } = scriptedRunner(() => {});
        const { h, importRunner, flush } = host(createRunner);
        h.onMessage(gen('g1', { modelId: 'm1' }));
        await flush();
        h.onMessage(gen('g2', { modelId: 'm1' }));
        await flush();
        expect(importRunner).toHaveBeenCalledTimes(1);
        expect(seen.disposed).toBe(0);
        h.onMessage(gen('g3', { modelId: 'm2' }));
        await flush();
        expect(importRunner).toHaveBeenCalledTimes(2);
        expect(seen.disposed).toBe(1);
    });

    it('init records the Transformers.js URL the main thread found, and the loader receives it', async () => {
        const { createRunner } = scriptedRunner(() => {});
        const loadTransformers = vi.fn(async () => ({ env: {} }) as never);
        const { h, flush } = host(createRunner, { loadTransformers });
        h.onMessage({ type: 'init', transformersUrl: 'https://cdn.example/transformers.js' });
        h.onMessage(gen('g1'));
        await flush();
        expect(loadTransformers).toHaveBeenCalledWith('https://cdn.example/transformers.js');
    });
});
