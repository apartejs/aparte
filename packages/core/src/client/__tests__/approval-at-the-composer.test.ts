// @vitest-environment jsdom
/**
 * The built-in gate asks at the composer, and the loop acts on what comes back.
 *
 * This is the path nothing exercised before. The gate was older than the presenter that
 * should have carried it: it was built with a segment renderer and a `document` event
 * because neither `showPanel` nor a typed presenter existed yet, and nobody came back
 * for it — partly because for a stretch the whole human-in-the-loop path was inert (a
 * provider bug sent `tools: []` on the wire, so no model ever called a tool). A path
 * nothing runs is a path nobody re-examines.
 *
 * The three outcomes are asserted end to end, from the tool the model asked for to the
 * history the model reads back.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../../components/composer/aparte-composer.js';
import '../../components/elicitation/aparte-elicitation.js';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import type { AparteTool } from '../../types/tools.js';

/** One approval-gated tool, one turn that asks for it, and a real presenter mounted. */
function harness(handler: () => void) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.registerTool(
        { name: 'delete_file', description: 'd', inputSchema: { type: 'object', properties: {} }, needsApproval: true } as AparteTool,
        (async () => { handler(); return 'deleted'; }) as never,
    );

    /** Every request the transport was sent, so the follow-up turn can be inspected. */
    const sent: unknown[][] = [];
    let served = false;
    cfg.setTransport({
        // `chat(provider, request, auth, ctx)` — the request is the SECOND argument.
        chat: (_provider: unknown, request: { messages: unknown[] }) => {
            sent.push(request.messages.map((m) => ({ ...(m as object) })));
            return new ReadableStream({
                start(controller) {
                    if (!served) {
                        served = true;
                        controller.enqueue({ type: 'tool_use', id: 'c1', name: 'delete_file', input: { path: 'a.ts' } });
                    }
                    controller.enqueue({ type: 'done' });
                    controller.close();
                },
            });
        },
    } as never);

    /*
     * A real per-instance chat: the config is attached to the host, and BOTH the
     * presenter and the render target live inside it. That is what makes
     * `requestUserInput({ target })` resolve this chat's presenter rather than the
     * global one — the same resolution a page with two chats depends on.
     */
    const host = document.createElement('div');
    const target = document.createElement('div');
    const composer = document.createElement('aparte-composer');
    composer.appendChild(document.createElement('aparte-composer-input'));
    host.append(target, composer, document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
    attachConfig(host, cfg);

    const patches: Array<Record<string, unknown>> = [];
    for (const m of ['updateMessage', 'addSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (target as unknown as Record<string, unknown>)[m] = () => {};
    }
    (target as unknown as Record<string, unknown>)['updateSegment'] =
        (_id: string, patch: Record<string, unknown>) => { patches.push(patch); };

    return { cfg, target, patches, sent };
}

const run = (client: AparteClient, cfg: AparteConfig, target: HTMLElement) =>
    (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(target, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

const optionLabelled = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')]
        .find((b) => b.textContent === label)!;

afterEach(() => { document.body.innerHTML = ''; });

describe('the built-in gate asks at the composer', () => {
    it('shows the tool it is asking about, in the composer and not in the transcript', async () => {
        const handler = vi.fn();
        const { cfg, target } = harness(handler);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        const turn = run(client, cfg, target);

        await vi.waitFor(() => expect(document.querySelector('.aparte-approval-panel')).not.toBeNull());
        expect(document.querySelector('.aparte-elic-message')?.textContent).toBe('Run delete_file?');
        expect(document.querySelector('aparte-composer')?.hasAttribute('data-panel-active')).toBe(true);
        // The decision surface used to be here. Nothing in the transcript is clickable.
        expect(document.querySelector('[data-tool-decision]')).toBeNull();

        optionLabelled('Reject').click();
        await turn;
    });

    it('runs the handler when the human approves', async () => {
        const handler = vi.fn();
        const { cfg, target, patches } = harness(handler);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        const turn = run(client, cfg, target);

        await vi.waitFor(() => expect(document.querySelector('.aparte-approval-panel')).not.toBeNull());
        optionLabelled('Approve').click();
        await turn;

        expect(handler).toHaveBeenCalledOnce();
        expect(patches.map(p => p['status'])).toContain('resolved');
        expect(document.querySelector('.aparte-approval-panel'), 'the panel closes on the decision').toBeNull();
    });

    it('skips the handler when the human refuses, and hands the model a turn', async () => {
        const handler = vi.fn();
        const { cfg, target, patches, sent } = harness(handler);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        const turn = run(client, cfg, target);

        await vi.waitFor(() => expect(document.querySelector('.aparte-approval-panel')).not.toBeNull());
        optionLabelled('Reject').click();
        await turn;

        expect(handler).not.toHaveBeenCalled();
        expect(patches.map(p => p['status'])).toContain('rejected');
        expect(sent, 'the model is asked again so it can answer the refusal').toHaveLength(2);
    });

    it('carries the words the human typed instead, into what the model reads', async () => {
        const handler = vi.fn();
        const { cfg, target, sent } = harness(handler);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        const turn = run(client, cfg, target);

        await vi.waitFor(() => expect(document.querySelector('.aparte-approval-panel')).not.toBeNull());
        const field = document.querySelector<HTMLTextAreaElement>('.aparte-approval-instruction')!;
        field.value = 'use --dry-run first';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        // Written text is submitted by the COMPOSER's button — the act that button
        // already means — while an option is its own click.
        (document.querySelector('aparte-composer') as unknown as { submit(): void }).submit();
        await turn;

        expect(handler, 'an instruction is a refusal, not a conditional approval').not.toHaveBeenCalled();
        const second = sent[1] as Array<{ role?: string; content?: string }>;
        const result = second.find(m => m.role === 'tool_result');
        expect(result?.content).toContain('use --dry-run first');
    });
});
