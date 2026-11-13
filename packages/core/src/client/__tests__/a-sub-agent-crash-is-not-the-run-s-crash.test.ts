// @vitest-environment jsdom
/**
 * A sub-agent's tool that crashes is the sub-agent's failure, not the run's.
 *
 * When the run's own handler throws, the run ends on that same error, and the client labels
 * it a tool's failure rather than a network or provider error (`toolCrash`). A sub-agent's
 * crash is answered inside its call — the sub-agent fails, the tool decides what the model
 * reads — so it must not relabel an error the run ends on later, even one with the same text.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';
import type { AparteStreamRunner } from '../stream-adapter.js';

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

/** A run whose call `c2` crashes with `Failed to fetch` — the sub-agent's when `agentId` is set — and which then fails with a network error of the same text. */
const runner = (agentId?: string): AparteStreamRunner => async (opts) => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'turn-start' });
    opts.emitter({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
    if (agentId) opts.emitter({ type: 'agent-start', agentId, toolCallId: 'c1' });
    opts.emitter({ type: 'tool-start', toolCallId: 'c2', name: 'fetch_page', input: {}, ...(agentId ? { agentId } : {}) });
    opts.emitter({ type: 'tool-failed', toolCallId: 'c2', error: 'Failed to fetch', ...(agentId ? { agentId } : {}) });
    if (agentId) opts.emitter({ type: 'agent-end', agentId, status: 'failed', error: 'Failed to fetch' });
    throw new TypeError('Failed to fetch');
};

const runLoop = (client: AparteClient, target: HTMLElement, cfg: AparteConfig) =>
    (client as unknown as { _streamLoop: (t: unknown, id: string, p: unknown, r: unknown, a: unknown) => Promise<unknown> })
        ._streamLoop(target, 'assistant-1', cfg.getAIProvider('mock'), { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true }, 'k');

afterEach(() => vi.restoreAllMocks());

describe('a crash', () => {
    it('of the run\'s own tool is labelled the tool\'s', async () => {
        const cfg = makeConfig();
        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner() });
        const error = await runLoop(client, makeTarget(), cfg).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AparteError);
        expect((error as AparteError).code).toBe(AparteErrorCode.UNKNOWN_ERROR);
    });

    it('of a sub-agent\'s tool leaves the run\'s error as it was', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cfg = makeConfig();
        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner('a1') });
        const error = await runLoop(client, makeTarget(), cfg).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TypeError);
        expect(error).not.toBeInstanceOf(AparteError);
    });
});
