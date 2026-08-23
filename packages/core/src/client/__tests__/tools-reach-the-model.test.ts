/**
 * A registered tool has to reach the model.
 *
 * It did not, on the documented primary path. `_toolsForCurrentModel()` sent the
 * tools only when the current model DECLARED `function_calling`, and defaulted to
 * stripping. Two facts made that default permanent:
 *
 *  - `getCurrentModel()` read `provider.getModels()` — the synchronous, static
 *    list — and every preset of `@aparte/provider-openai-compat` leaves it empty,
 *    because a compat endpoint's list only exists after a `GET /models`.
 *  - a `/models` listing returns `{id, object, owned_by}`, so even fetched, a model
 *    says nothing about tools.
 *
 * Result: `getTools()` held the tool an app had explicitly registered, `tools: []`
 * went on the wire, and the model answered — correctly — that it had no such tool.
 * A user hit exactly that against LM Studio. No error, no warning: the whole tools
 * guide, `needsApproval`, HITL and `@aparte/plugin-ask-question` were inert.
 *
 * Two fixes, and this file pins both: a fetched list now reaches
 * `getCurrentModel()` (see config/__tests__/fetched-model-capabilities.test.ts),
 * and the gate now asks whether the model said it CANNOT rather than whether it
 * said it can.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteAIModel, AparteTool } from '../../types/index.js';

const TOOL: AparteTool = {
    name: 'ask_question',
    description: 'Ask the user something',
    inputSchema: { type: 'object', properties: {} },
};

/**
 * A turn whose only observable is the request that reached the transport.
 * `models` is what the provider declares statically — empty for every compat
 * preset, which is the case that mattered.
 */
function turnWith(models: AparteAIModel[]): { sent: () => AparteTool[] | undefined; run: () => Promise<void> } {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => models,
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.registerTool(TOOL, (async () => 'ok') as never);

    let seen: AparteTool[] | undefined;
    cfg.setTransport({
        chat: (_provider: unknown, request: { tools?: AparteTool[] }) => {
            seen = request.tools;
            return new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'done' });
                    controller.close();
                },
            });
        },
    } as never);

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }

    const client = new AparteClient({ config: cfg, autoRegister: false });
    return {
        sent: () => seen,
        run: () => (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k'),
    };
}

describe('the tools array that reaches the transport', () => {
    it('carries the registered tool when the model says nothing about capabilities', async () => {
        // THE case that was broken: a compat preset declares no models, so the
        // current model is unknown. An app that registered a tool meant it.
        const turn = turnWith([]);
        await turn.run();
        expect(turn.sent()?.map(t => t.name)).toContain('ask_question');
    });

    it('carries it when the model declares function_calling', async () => {
        const turn = turnWith([{ id: 'm', name: 'M', capabilities: ['streaming', 'function_calling'] }]);
        await turn.run();
        expect(turn.sent()?.map(t => t.name)).toContain('ask_question');
    });

    it('sends none when the model declares capabilities WITHOUT function calling', async () => {
        // A statement is respected: this model said what it can do, and calling a
        // tool is not on the list.
        const turn = turnWith([{ id: 'm', name: 'M', capabilities: ['streaming'] }]);
        await turn.run();
        expect(turn.sent()).toBeUndefined();
    });
});
