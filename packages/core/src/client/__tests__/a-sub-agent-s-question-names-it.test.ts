// @vitest-environment jsdom
/**
 * A sub-agent's question names it.
 *
 * A call that needs a person's approval can be the reply's own model's, or a sub-agent's a
 * tool opened. The panel says which: "Allow Write a.ts for Researcher?" rather than an
 * "Allow Write a.ts?" the person would take for the assistant's own. The name is the one the
 * sub-agent was started with — handed with the call by our own loop, and learned from the
 * turn's `agent-start` for a paused run — and a sub-agent with no name keeps the plain
 * question: never an id, never "undefined wants to…".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runSubAgent } from '@aparte/engine';
import '../../components/composer/aparte-composer.js';
import '../../components/elicitation/aparte-elicitation.js';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import type { AparteTool, AparteToolCallSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

/** One stream per model id, each answering its turns in order; past the end, `done`. */
function transport(scripts: Record<string, unknown[][]>) {
    const turns: Record<string, number> = {};
    return {
        chat: (_provider: unknown, request: { modelId: string }) => new ReadableStream({
            start(controller) {
                const n = turns[request.modelId] ?? 0;
                turns[request.modelId] = n + 1;
                for (const event of scripts[request.modelId]?.[n] ?? []) controller.enqueue(event);
                controller.enqueue({ type: 'done' });
                controller.close();
            },
        }),
    };
}

/** A real chat: a config attached to a host, the presenter and the target inside it. */
function harness(opts: { name?: string; parentWrites?: boolean; streamRunner?: (o: AparteStreamRunOptions) => Promise<undefined> } = {}) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.registerTool(
        { name: 'write_file', description: 'w', inputSchema: { type: 'object', properties: {} }, needsApproval: true } as AparteTool,
        (async () => 'written') as never,
    );
    cfg.registerTool(
        { name: 'delegate', description: 'd', inputSchema: { type: 'object', properties: {} } } as AparteTool,
        (async (_call: unknown, signal: AbortSignal, context: { run?: never }) => {
            const answer = await runSubAgent(context.run!, {
                ...(opts.name !== undefined ? { name: opts.name } : {}),
                request: { modelId: 'child', messages: [{ role: 'user', content: 'go' }] },
            }, signal);
            return answer.text;
        }) as never,
    );
    // The call as its row names it: the label, then what it targets.
    cfg.registerToolDisplay('write_file', {
        label: 'Write',
        summary: (s: AparteToolCallSegment) => String(s.toolCall.input['path']),
    });
    cfg.setTransport(transport({
        m: [
            opts.parentWrites
                ? [{ type: 'tool_use', id: 'p1', name: 'write_file', input: { path: 'b.ts' } }]
                : [{ type: 'tool_use', id: 'c1', name: 'delegate', input: {} }],
            [{ type: 'text', delta: 'Done.' }],
        ],
        child: [
            [{ type: 'tool_use', id: 'w1', name: 'write_file', input: { path: 'a.ts' } }],
            [{ type: 'text', delta: 'written' }],
        ],
    }) as never);

    const host = document.createElement('div');
    const target = document.createElement('div');
    const composer = document.createElement('aparte-composer');
    composer.appendChild(document.createElement('aparte-composer-input'));
    host.append(target, composer, document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
    attachConfig(host, cfg);
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (target as unknown as Record<string, unknown>)[m] = () => {};
    }

    const client = new AparteClient({ config: cfg, autoRegister: false, ...(opts.streamRunner ? { streamRunner: opts.streamRunner } : {}) });
    const turn = (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(target, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
    return { cfg, turn, target };
}

const question = (): string | undefined => document.querySelector('.aparte-elic-message')?.textContent ?? undefined;

/** The panel's question, once it is up; then the call is refused so the turn ends. */
async function asked(turn: Promise<void>): Promise<string | undefined> {
    await expect.poll(() => document.querySelector('.aparte-approval-panel')).not.toBeNull();
    const shown = question();
    [...document.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')].find((b) => b.textContent === 'Reject')!.click();
    await turn;
    return shown;
}

/** A server run that pauses on a sub-agent's call, after announcing that sub-agent. */
const pausedOnAChild = (name?: string) => {
    let calls = 0;
    return async (o: AparteStreamRunOptions): Promise<undefined> => {
        o.emitter({ type: 'run-start' });
        if (calls++ === 0) {
            o.emitter({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
            o.emitter({ type: 'agent-start', agentId: 'a1', toolCallId: 'c1', ...(name !== undefined ? { name } : {}) });
            o.emitter({ type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' });
            o.emitter({ type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' });
            o.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'approval', agentId: 'a1' }] });
        } else {
            o.emitter({ type: 'run-done' });
        }
        return undefined;
    };
};

afterEach(() => { document.body.innerHTML = ''; });

describe("a sub-agent's question names it", () => {
    it('in our own loop, with the name it was started with and the call as its row names it', async () => {
        const { turn } = harness({ name: 'Researcher' });
        expect(await asked(turn)).toBe('Allow Write a.ts for Researcher?');
    });

    it('a sub-agent with no name keeps the plain question', async () => {
        const { turn } = harness();
        expect(await asked(turn)).toBe('Allow Write a.ts?');
    });

    it("the reply's own call still reads the plain question", async () => {
        const { turn } = harness({ name: 'Researcher', parentWrites: true });
        expect(await asked(turn)).toBe('Allow Write b.ts?');
    });

    it("in a paused run, with the name the turn's agent-start gave", async () => {
        const { turn } = harness({ streamRunner: pausedOnAChild('Researcher') });
        expect(await asked(turn)).toBe('Allow Write a.ts for Researcher?');
    });

    it('in a paused run, a sub-agent announced with no name keeps the plain question', async () => {
        const { turn } = harness({ streamRunner: pausedOnAChild() });
        expect(await asked(turn)).toBe('Allow Write a.ts?');
    });

    it('follows a language switch while it is open', async () => {
        const { cfg, turn } = harness({ name: 'Researcher' });
        await expect.poll(() => document.querySelector('.aparte-approval-panel')).not.toBeNull();
        expect(question()).toBe('Allow Write a.ts for Researcher?');

        cfg.setLocale({ ...cfg.getLocale(), approvalAskBy: '{agent} veut lancer {tool}', rejectTool: 'Refuser' });
        expect(question(), 'the frame follows, the names do not').toBe('Researcher veut lancer Write a.ts');

        [...document.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')].find((b) => b.textContent === 'Refuser')!.click();
        await turn;
    });

    it("a paused run's page tool that belongs to a sub-agent is asked about under it", async () => {
        // The server hands the call back for the page to run (`external`); the page's own
        // policy gates it. The row that waits is the sub-agent's, so the event says whose.
        let calls = 0;
        const pausedOnAPageTool = async (o: AparteStreamRunOptions): Promise<undefined> => {
            o.emitter({ type: 'run-start' });
            if (calls++ === 0) {
                o.emitter({ type: 'agent-start', agentId: 'a1', name: 'Researcher' });
                o.emitter({ type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' });
                o.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'external', agentId: 'a1' }] });
            } else {
                o.emitter({ type: 'run-done' });
            }
            return undefined;
        };
        const { cfg, turn } = harness({ streamRunner: pausedOnAPageTool });
        const waits: unknown[] = [];
        cfg.observeRunEvents((event) => { if (event.type === 'tool-awaiting-approval') waits.push(event); });

        expect(await asked(turn)).toBe('Allow Write a.ts for Researcher?');
        expect(waits).toEqual([{ type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' }]);
    });

    it("approving a sub-agent's page tool in a paused run moves the sub-agent's row, never the reply's", async () => {
        // The row that waits lives with whoever draws the sub-agent; the reply has none for
        // it (and a row of the reply's sharing the id must not flip to running).
        let calls = 0;
        const pausedOnAPageTool = async (o: AparteStreamRunOptions): Promise<undefined> => {
            o.emitter({ type: 'run-start' });
            if (calls++ === 0) {
                o.emitter({ type: 'agent-start', agentId: 'a1', name: 'Researcher' });
                o.emitter({ type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' });
                o.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'external', agentId: 'a1' }] });
            } else {
                o.emitter({ type: 'run-done' });
            }
            return undefined;
        };
        const { cfg, turn, target } = harness({ streamRunner: pausedOnAPageTool });
        const rowEvents: unknown[] = [];
        cfg.observeRunEvents((event) => {
            if (event.type === 'tool-awaiting-approval' || event.type === 'tool-approved') rowEvents.push(event);
        });
        await expect.poll(() => document.querySelector('.aparte-approval-panel')).not.toBeNull();
        // What the reply is written from the Approve on.
        const replyWrites: string[] = [];
        (target as unknown as { updateSegment: (id: string) => void }).updateSegment = (id) => { replyWrites.push(id); };
        [...document.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')].find((b) => b.textContent === 'Approve')!.click();
        await turn;

        expect(rowEvents).toEqual([
            { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, agentId: 'a1' },
            { type: 'tool-approved', toolCallId: 'w1', agentId: 'a1' },
        ]);
        expect(replyWrites).not.toContain('tool-w1');
    });
});
