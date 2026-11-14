import { describe, it, expect } from 'vitest';
import { AparteClient, type AparteClientOptions } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteTool, AparteToolHandler } from '../../types/tools.js';

/**
 * The page's loop keeps the order of a tool's calls unless the tool says `parallel: true`
 * (#202). A registered tool's `parallel` reaches the loop the way its `needsApproval` does, and
 * `AparteClientOptions.parallelTools` the way `maxTurns` does: `false` runs every call one
 * after another, whatever its tool says.
 */
const tool = (name: string, extra: Partial<AparteTool> = {}): AparteTool => ({
    name, description: name, inputSchema: { type: 'object', properties: {} }, ...extra,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

function harness(tools: AparteTool[], calls: { id: string; name: string }[]) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');

    const started: string[] = [];
    const running = new Set<string>();
    const releases = new Map<string, () => void>();
    const handler: AparteToolHandler = async (call) => {
        started.push(call.id);
        running.add(call.id);
        await new Promise<void>((resolve) => { releases.set(call.id, resolve); });
        running.delete(call.id);
        return { toolCallId: call.id, content: `ran ${call.id}` };
    };
    for (const t of tools) cfg.registerTool(t, handler);

    let served = false;
    cfg.setTransport({
        chat: () => new ReadableStream({
            start(controller) {
                if (!served) {
                    served = true;
                    for (const c of calls) controller.enqueue({ type: 'tool_use', id: c.id, name: c.name, input: {} });
                }
                controller.enqueue({ type: 'done' });
                controller.close();
            },
        }),
    } as never);

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    const turn = (options: Partial<AparteClientOptions> = {}) => {
        const client = new AparteClient({ config: cfg, autoRegister: false, ...options });
        return (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
    };
    const release = async (id: string) => {
        releases.get(id)!();
        await settle();
    };
    return { turn, started, running, release };
}

describe('AparteClient — the order of a step\'s tool calls', () => {
    it('runs a call of a tool that says nothing once the call before it has settled', async () => {
        const h = harness([tool('edit_file'), tool('run_command')], [{ id: 'e', name: 'edit_file' }, { id: 'c', name: 'run_command' }]);
        const done = h.turn();

        await settle();
        expect(h.started).toEqual(['e']);
        await h.release('e');
        expect(h.started).toEqual(['e', 'c']);
        await h.release('c');
        await done;
    });

    it('runs together the calls of tools that say parallel: true', async () => {
        const h = harness([tool('read_file', { parallel: true })], [{ id: 'r1', name: 'read_file' }, { id: 'r2', name: 'read_file' }]);
        const done = h.turn();

        await settle();
        expect([...h.running].sort()).toEqual(['r1', 'r2']);
        await h.release('r2');
        await h.release('r1');
        await done;
    });

    it('runs them one after another with parallelTools: false', async () => {
        const h = harness([tool('read_file', { parallel: true })], [{ id: 'r1', name: 'read_file' }, { id: 'r2', name: 'read_file' }]);
        const done = h.turn({ parallelTools: false });

        await settle();
        expect(h.started).toEqual(['r1']);
        await h.release('r1');
        expect(h.started).toEqual(['r1', 'r2']);
        await h.release('r2');
        await done;
    });

    it('holds the command until the person has answered about the edit, even when both say parallel: true', async () => {
        let answer!: (d: { approved: boolean }) => void;
        const h = harness(
            [tool('edit_file', { needsApproval: true, parallel: true }), tool('run_command', { parallel: true })],
            [{ id: 'e', name: 'edit_file' }, { id: 'c', name: 'run_command' }],
        );
        const done = h.turn({ approvalResolver: () => new Promise((resolve) => { answer = resolve; }) });

        await settle();
        expect(h.started).toEqual([]);
        answer({ approved: true });
        await settle();
        expect([...h.running].sort()).toEqual(['c', 'e']);
        await h.release('e');
        await h.release('c');
        await done;
    });
});
