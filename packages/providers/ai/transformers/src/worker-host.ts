/**
 * The worker's logic, as a function of its three seams.
 *
 * `worker.ts` is the two-line shell that binds this to `self`; everything it decides is
 * here, with `post`, `loadTransformers` and `importRunner` injected — so the protocol is
 * tested with fakes where no Worker and no model can load (`worker-host.test.ts`).
 *
 * The protocol (main ⇄ worker):
 *
 *   → init            { transformersUrl? }                      once, first
 *   → prepare         { id, modelId, task?, runner?, dtype?, device? }
 *   → generate        { id, modelId, messages, options, task?, runner?, dtype?, device? }
 *   → cancel          { id }
 *   → command         { id, modelId, name, payload, task?, runner?, dtype?, device? }
 *   ← progress        { id, status, file?, progress?, detail? }
 *   ← pipeline-ready  { modelId }                                a runner is up
 *   ← prepare-error   { id, message }
 *   ← gen-event       { id, event }                              text | thinking | tool_use
 *   ← gen-done        { id, usage? }                             the host closes; `done` is never forwarded raw
 *   ← gen-error       { id, message }                            emitted or thrown
 *   ← warning         { message }                                once per distinct text
 *   ← command-result  { id, result } | { id, error }
 *
 * One runner is resident at a time, keyed by model AND runner: a switch disposes the
 * previous one first, which is the "one pipeline per tab" rule this package has always
 * kept — a local model is gigabytes, and two of them resident is the failure to avoid.
 */

import type { AparteChatMessage, AparteStreamEvent, AparteUsage } from '@aparte/core';
import type { BuiltInRunner, Device, Dtype, GenerationOptions, RunnerModule, RunnerProgress, TransformersModule, TransformersRunner } from './runners/types.js';

interface RunnerSelection {
    modelId: string;
    task?: BuiltInRunner;
    runner?: string;
    dtype?: Dtype;
    device?: Device;
}

export type InMessage =
    | { type: 'init'; transformersUrl?: string }
    | ({ type: 'prepare'; id: string } & RunnerSelection)
    | ({ type: 'generate'; id: string; messages: AparteChatMessage[]; options: GenerationOptions } & RunnerSelection)
    | { type: 'cancel'; id: string }
    | ({ type: 'command'; id: string; name: string; payload: unknown } & RunnerSelection);

export type OutMessage =
    | ({ type: 'progress'; id: string } & RunnerProgress)
    | { type: 'pipeline-ready'; modelId: string }
    | { type: 'prepare-error'; id: string; message: string }
    | { type: 'gen-event'; id: string; event: AparteStreamEvent }
    | { type: 'gen-done'; id: string; usage?: AparteUsage }
    | { type: 'gen-error'; id: string; message: string }
    | { type: 'warning'; message: string }
    | { type: 'command-result'; id: string; result?: unknown; error?: string };

export interface WorkerHostDeps {
    post(message: OutMessage): void;
    /** Resolve Transformers.js — the bundled specifier first, else the URL `init` carried. */
    loadTransformers(moduleUrl?: string): Promise<TransformersModule>;
    /** Import the runner module a selection names: a built-in by `task`, a custom one by `runner` URL. */
    importRunner(spec: { task: BuiltInRunner; runner?: string }): Promise<RunnerModule>;
}

const errorText = (err: unknown, fallback: string): string => (err instanceof Error && err.message) || fallback;

export function createWorkerHost(deps: WorkerHostDeps): { onMessage(msg: InMessage): void } {
    let moduleUrl: string | undefined;
    let current: { key: string; runner: TransformersRunner } | null = null;
    const generates = new Map<string, AbortController>();
    const warned = new Set<string>();

    const warn = (message: string): void => {
        if (warned.has(message)) return;
        warned.add(message);
        deps.post({ type: 'warning', message });
    };

    async function ensureRunner(sel: RunnerSelection, progressId?: string): Promise<TransformersRunner> {
        const task = sel.task ?? 'text-generation';
        const key = `${sel.modelId}::${sel.runner ?? task}`;
        if (current?.key === key) return current.runner;
        if (current) {
            const previous = current;
            current = null;
            await previous.runner.dispose?.();
        }
        const transformers = await deps.loadTransformers(moduleUrl);
        const { createRunner } = await deps.importRunner({ task, runner: sel.runner });
        const runner = await createRunner({
            transformers,
            modelId: sel.modelId,
            dtype: sel.dtype,
            device: sel.device,
            progress: (p) => { if (progressId) deps.post({ type: 'progress', id: progressId, ...p }); },
            warn,
        });
        current = { key, runner };
        deps.post({ type: 'pipeline-ready', modelId: sel.modelId });
        return runner;
    }

    async function handlePrepare(msg: Extract<InMessage, { type: 'prepare' }>): Promise<void> {
        try {
            await ensureRunner(msg, msg.id);
            deps.post({ type: 'progress', id: msg.id, status: 'ready' });
        } catch (err) {
            deps.post({ type: 'prepare-error', id: msg.id, message: errorText(err, 'Failed to load model') });
        }
    }

    async function handleGenerate(msg: Extract<InMessage, { type: 'generate' }>): Promise<void> {
        const controller = new AbortController();
        generates.set(msg.id, controller);
        let usage: AparteUsage | undefined;
        let closed = false;
        try {
            const runner = await ensureRunner(msg, msg.id);
            await runner.generate({
                messages: msg.messages,
                options: msg.options,
                signal: controller.signal,
                emit: (event) => {
                    if (closed) return;
                    // `done` and `error` close the stream, and closing is the host's: it
                    // releases the queue slot on the main thread through gen-done/gen-error.
                    if (event.type === 'done') { usage = event.usage; return; }
                    if (event.type === 'error') { closed = true; deps.post({ type: 'gen-error', id: msg.id, message: event.message }); return; }
                    deps.post({ type: 'gen-event', id: msg.id, event });
                },
            });
            if (!closed) deps.post({ type: 'gen-done', id: msg.id, ...(usage ? { usage } : {}) });
        } catch (err) {
            if (!closed) deps.post({ type: 'gen-error', id: msg.id, message: errorText(err, 'Generation failed') });
        } finally {
            generates.delete(msg.id);
        }
    }

    async function handleCommand(msg: Extract<InMessage, { type: 'command' }>): Promise<void> {
        try {
            const runner = await ensureRunner(msg);
            if (!runner.command) {
                deps.post({ type: 'command-result', id: msg.id, error: `This runner has no command handler (asked for "${msg.name}")` });
                return;
            }
            const result = await runner.command(msg.name, msg.payload);
            deps.post({ type: 'command-result', id: msg.id, result });
        } catch (err) {
            deps.post({ type: 'command-result', id: msg.id, error: errorText(err, 'Command failed') });
        }
    }

    return {
        onMessage(msg: InMessage): void {
            switch (msg.type) {
                case 'init': moduleUrl = msg.transformersUrl; break;
                case 'prepare': void handlePrepare(msg); break;
                case 'generate': void handleGenerate(msg); break;
                case 'cancel': generates.get(msg.id)?.abort(); break;
                case 'command': void handleCommand(msg); break;
            }
        },
    };
}
