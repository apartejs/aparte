/**
 * `AparteTool.systemPrompt` has to actually reach the model.
 *
 * The field is documented on the type as "System prompt injected automatically when this
 * tool is registered", and the tools guide repeats it — and nothing anywhere read it.
 * That failure mode is silent in the worst way: the tool still WORKS, because the model
 * gets its name and schema either way, so the only thing lost is the sentence explaining
 * when to reach for it. `@aparte/plugin-ask-user` sets one, so a shipped plugin was
 * losing its instructions and no test could tell.
 *
 * Only what LEAVES for the model shows it, which is why this asserts on the request.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteTool } from '../../types/tools.js';

function harness() {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');

    const seen: AparteChatRequest[] = [];
    cfg.setTransport({
        chat: (_p: unknown, request: AparteChatRequest) => {
            seen.push(request);
            return new ReadableStream({
                start(c) {
                    c.enqueue({ type: 'done' });
                    c.close();
                },
            });
        },
    } as never);

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    (el as unknown as Record<string, unknown>).getMessages = () => [];
    return { cfg, el, seen };
}

const tool = (name: string, systemPrompt?: string): AparteTool => ({
    name,
    description: `the ${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    ...(systemPrompt ? { systemPrompt } : {}),
});

const systemText = (seen: AparteChatRequest[]): string =>
    (seen[0]?.messages ?? [])
        .filter((m) => m.role === 'system')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n');

async function send(cfg: AparteConfig, el: HTMLElement) {
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
    await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
        new CustomEvent('aparte-send', { detail: { content: 'hello' } }),
    );
}

describe("a registered tool's systemPrompt", () => {
    it('reaches the model', async () => {
        const { cfg, el, seen } = harness();
        cfg.registerTool(tool('delete_file', 'Ask before deleting anything under src/.'), async () => ({
            toolCallId: 't', content: 'ok',
        }));
        await send(cfg, el);
        expect(systemText(seen)).toContain('Ask before deleting anything under src/.');
    });

    it('carries every tool that sets one, and skips the ones that do not', async () => {
        const { cfg, el, seen } = harness();
        const noop = async () => ({ toolCallId: 't', content: 'ok' });
        cfg.registerTool(tool('first', 'FIRST INSTRUCTION'), noop);
        cfg.registerTool(tool('silent'), noop);
        cfg.registerTool(tool('second', 'SECOND INSTRUCTION'), noop);
        await send(cfg, el);

        const text = systemText(seen);
        expect(text).toContain('FIRST INSTRUCTION');
        expect(text).toContain('SECOND INSTRUCTION');
        // Registration order, so two instructions read in the order they were declared.
        expect(text.indexOf('FIRST INSTRUCTION')).toBeLessThan(text.indexOf('SECOND INSTRUCTION'));
    });

    it('does not invent a system message when no tool sets one', async () => {
        const { cfg, el, seen } = harness();
        cfg.registerTool(tool('silent'), async () => ({ toolCallId: 't', content: 'ok' }));
        await send(cfg, el);
        expect((seen[0]?.messages ?? []).filter((m) => m.role === 'system')).toHaveLength(0);
    });

    it("stays separate from the app's own system prompt, and comes after it", async () => {
        const { cfg, el, seen } = harness();
        cfg.setSystemPrompt('You are a careful assistant.');
        cfg.registerTool(tool('delete_file', 'TOOL INSTRUCTION'), async () => ({ toolCallId: 't', content: 'ok' }));
        await send(cfg, el);

        const system = (seen[0]?.messages ?? []).filter((m) => m.role === 'system');
        expect(system).toHaveLength(2);
        expect(String(system[0]?.content)).toContain('You are a careful assistant.');
        expect(String(system[1]?.content)).toContain('TOOL INSTRUCTION');
    });
});
