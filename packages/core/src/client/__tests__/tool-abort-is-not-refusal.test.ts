import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteTool } from '../../types/tools.js';

/**
 * Pressing Stop while a tool waits for approval is NOT the human refusing it.
 *
 * `_awaitToolDecision` resolved `{ approved: false }` on abort, which is the same
 * value an explicit Reject produces — so the gate took the refusal branch, stamped
 * the segment `'rejected'`, and pushed "Tool execution was rejected by the user."
 * into the history. The user stopped the turn; the model was told they had refused,
 * and the sentence it read named a decision nobody made.
 *
 * The two cases have to stay visibly different, so both directions are asserted
 * here: a stop must not look like a refusal, and a refusal must still look like one.
 */
const REJECTION = 'Tool execution was rejected by the user.';

const tool = (name: string, extra: Partial<AparteTool> = {}): AparteTool => ({
    name, description: name, inputSchema: { type: 'object', properties: {} }, ...extra,
});

/** One approval-gated tool, one tool_use event, and every segment patch captured. */
function harness(handler: () => void) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.registerTool(tool('danger', { needsApproval: true }), (async () => { handler(); return 'ok'; }) as never);

    let served = false;
    cfg.setTransport({
        chat: () => new ReadableStream({
            start(controller) {
                // Only the first turn streams the tool call, so a loop that wrongly
                // continues cannot hang the test.
                if (!served) { served = true; controller.enqueue({ type: 'tool_use', id: 'c1', name: 'danger', input: {} }); }
                controller.enqueue({ type: 'done' });
                controller.close();
            },
        }),
    } as never);

    const patches: Array<Record<string, unknown>> = [];
    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    return { cfg, el, patches };
}

const run = (client: AparteClient, cfg: AparteConfig, el: HTMLElement) =>
    (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

describe('a stop is not a refusal', () => {
    it('an abort while awaiting approval does not tell the model the human refused', async () => {
        const handler = vi.fn();
        const { cfg, el, patches } = harness(handler);

        // No `approvalResolver`: the built-in DOM channel is what aborts.
        const client = new AparteClient({ config: cfg, autoRegister: false });
        (el as unknown as Record<string, unknown>)['updateSegment'] = (_id: string, patch: Record<string, unknown>) => {
            patches.push(patch);
            // The gate has just opened and the human presses Stop instead of deciding.
            if (patch['status'] === 'awaiting-approval') client.abort();
        };

        await run(client, cfg, el);

        expect(handler, 'a tool nobody approved must not run').not.toHaveBeenCalled();
        expect(patches.map(p => p['status']), 'a stopped wait is aborted, never rejected').not.toContain('rejected');
        expect(patches.map(p => p['result']), 'and the refusal sentence belongs to a person').not.toContain(REJECTION);
        expect(patches.map(p => p['status'])).toContain('aborted');
    });

    it('an explicit refusal is still recorded as one', async () => {
        const handler = vi.fn();
        const { cfg, el, patches } = harness(handler);
        (el as unknown as Record<string, unknown>)['updateSegment'] = (_id: string, patch: Record<string, unknown>) => {
            patches.push(patch);
        };

        const client = new AparteClient({
            config: cfg, autoRegister: false,
            approvalResolver: async () => ({ approved: false }),
        });
        await run(client, cfg, el);

        expect(handler).not.toHaveBeenCalled();
        expect(patches.map(p => p['status'])).toContain('rejected');
        expect(patches.map(p => p['result'])).toContain(REJECTION);
    });
});
