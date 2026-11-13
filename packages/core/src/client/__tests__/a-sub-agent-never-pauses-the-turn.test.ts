// @vitest-environment jsdom
/**
 * A run-level event that carries an `agentId` is not the run's.
 *
 * The engine never emits one, and the server loop's runner drops such a line. A runner of the
 * app's own can still hand one over: the client reads `run-suspended` and `run-done` off the
 * events to know how the turn ended, and must not read a sub-agent's.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteStreamRunEvent, AparteStreamRunner } from '../stream-adapter.js';

function makeConfig(): AparteConfig {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    return cfg;
}

function makeTarget(): HTMLElement {
    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    return el;
}

afterEach(() => vi.restoreAllMocks());

describe('a run-level event carrying an agentId', () => {
    it('neither pauses nor ends the turn', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cfg = makeConfig();
        const runner: AparteStreamRunner = async (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'agent-start', agentId: 'a1' });
            // What a hand-written runner might forward from a nested loop.
            opts.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'c9', name: 'ask', input: {}, reason: 'approval' }], agentId: 'a1' } as unknown as AparteStreamRunEvent);
            opts.emitter({ type: 'run-done', finishReason: 'length', agentId: 'a1' } as unknown as AparteStreamRunEvent);
            opts.emitter({ type: 'agent-end', agentId: 'a1', status: 'done' });
            opts.emitter({ type: 'text-delta', delta: 'Done.' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done', finishReason: 'stop' });
            return undefined;
        };
        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner });
        const result = await (client as unknown as { _streamLoop: (t: unknown, id: string, p: unknown, r: unknown, a: unknown) => Promise<{ finishReason?: string; suspended?: unknown }> })
            ._streamLoop(makeTarget(), 'assistant-1', cfg.getAIProvider('mock'), { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true }, 'k');

        // The sub-agent's `run-suspended` is not a pause of the turn: nothing to resume.
        expect(result.suspended).toBeUndefined();
        // The run's own reason, not the sub-agent's `length`.
        expect(result.finishReason).toBe('stop');
    });
});
