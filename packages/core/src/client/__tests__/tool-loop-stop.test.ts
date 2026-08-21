import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfigClass } from '../../config/index.js';
import type { AparteTool } from '../../types/tools.js';

/**
 * When the loop decides to stop, it must stop — including for the tool calls
 * the model already emitted in the same turn.
 *
 * `_streamLoop` set `continueLoop = false` and then `break`, but that `break`
 * left the `switch`, not the SSE `while`. So a turn the human explicitly
 * rejected went on to execute every remaining tool call: side effects ran
 * *after* a refusal, and their results were appended to a history whose loop
 * was already stopped.
 */
const tool = (name: string, extra: Partial<AparteTool> = {}): AparteTool => ({
    name, description: name, parameters: { type: 'object', properties: {} }, ...extra,
});

function harness(handlers: Record<string, () => void>, tools: AparteTool[], events: unknown[]) {
    const cfg = new AparteConfigClass();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    for (const t of tools) {
        cfg.registerTool(t, (async () => { handlers[t.name]?.(); return 'ok'; }) as never);
    }
    let served = false;
    cfg.setTransport({
        chat: () => new ReadableStream({
            start(controller) {
                // Only the first turn streams tool calls; a follow-up turn (if the
                // loop wrongly continues) just completes, so the test cannot hang.
                if (!served) { served = true; for (const e of events) controller.enqueue(e); }
                controller.enqueue({ type: 'done' });
                controller.close();
            },
        }),
    } as never);

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    return { cfg, el };
}

describe('AparteClient — a turn that stops, stops', () => {
    it('does not run the remaining tool calls after the human rejects one', async () => {
        const alpha = vi.fn();
        const beta = vi.fn();
        const { cfg, el } = harness(
            { alpha, beta },
            [tool('alpha', { needsApproval: true }), tool('beta')],
            [
                { type: 'tool_use', id: 'c1', name: 'alpha', input: {} },
                { type: 'tool_use', id: 'c2', name: 'beta', input: {} },
            ],
        );

        const client = new AparteClient({
            config: cfg, autoRegister: false,
            approvalResolver: async () => ({ approved: false }),
        });
        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

        expect(alpha, 'a rejected tool must not run').not.toHaveBeenCalled();
        expect(beta, 'the turn was stopped by a refusal — later tool calls must not run').not.toHaveBeenCalled();
    });

    it('still runs every tool of a turn nobody stopped', async () => {
        const alpha = vi.fn();
        const beta = vi.fn();
        const { cfg, el } = harness(
            { alpha, beta },
            [tool('alpha'), tool('beta')],
            [
                { type: 'tool_use', id: 'c1', name: 'alpha', input: {} },
                { type: 'tool_use', id: 'c2', name: 'beta', input: {} },
            ],
        );

        const client = new AparteClient({ config: cfg, autoRegister: false });
        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

        expect(alpha).toHaveBeenCalled();
        expect(beta).toHaveBeenCalled();
    });
});
