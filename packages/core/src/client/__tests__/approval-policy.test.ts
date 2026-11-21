import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteTool, AparteApprovalPolicy } from '../../types/tools.js';

/**
 * An approval POLICY decides per call — a mode, not a flag on each tool. Three
 * things it must do that a `needsApproval` boolean cannot: allow a flagged tool
 * without ever pausing it, refuse a call with its own sentence (nobody said
 * "no", so the model must not be told the user did), and leave a tool it has no
 * opinion about exactly as flagged.
 */
const tool = (name: string, extra: Partial<AparteTool> = {}): AparteTool => ({
    name, description: name, inputSchema: { type: 'object', properties: {} }, ...extra,
});

function harness(calls: Array<{ id: string; name: string; input?: Record<string, unknown> }>) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const ran: string[] = [];
    cfg.registerTool(tool('read_file'), (async (c: { id: string }) => { ran.push(c.id); return 'ok'; }) as never);
    cfg.registerTool(tool('write_file', { needsApproval: true }), (async (c: { id: string }) => { ran.push(c.id); return 'ok'; }) as never);

    let served = false;
    cfg.setTransport({
        chat: () => new ReadableStream({
            start(controller) {
                if (!served) {
                    served = true;
                    for (const c of calls) controller.enqueue({ type: 'tool_use', id: c.id, name: c.name, input: c.input ?? {} });
                }
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
    (el as unknown as Record<string, unknown>)['updateSegment'] = (_id: string, patch: Record<string, unknown>) => { patches.push(patch); };
    return { cfg, el, patches, ran };
}

const run = (cfg: AparteConfig, el: HTMLElement) => {
    const client = new AparteClient({ config: cfg, autoRegister: false });
    return (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
};

describe('AparteConfig.ruleOnToolCall — the policy and the flag, combined in one place', () => {
    it('with no policy, the tool flag decides: flagged asks, unflagged runs', () => {
        const cfg = new AparteConfig();
        cfg.registerTool(tool('write_file', { needsApproval: true }), (async () => 'ok') as never);
        cfg.registerTool(tool('read_file'), (async () => 'ok') as never);
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'write_file', input: {} }).verdict).toBe('ask');
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'read_file', input: {} }).verdict).toBe('allow');
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'unknown', input: {} }).verdict).toBe('allow');
    });

    it('a policy with no opinion (undefined) falls back to the flag; one with an opinion wins', () => {
        const cfg = new AparteConfig();
        cfg.registerTool(tool('write_file', { needsApproval: true }), (async () => 'ok') as never);
        const policy: AparteApprovalPolicy = (call) => (call.input['path'] === '/tmp/x' ? { verdict: 'allow' } : undefined);
        cfg.setApprovalPolicy(policy);
        expect(cfg.getApprovalPolicy()).toBe(policy);
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'write_file', input: { path: '/tmp/x' } }).verdict).toBe('allow');
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'write_file', input: { path: '/etc/x' } }).verdict).toBe('ask');
        cfg.setApprovalPolicy(null);
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'write_file', input: { path: '/tmp/x' } }).verdict).toBe('ask');
    });

    it('the policy receives the registered tool, so it can read its own flag', () => {
        const cfg = new AparteConfig();
        cfg.registerTool(tool('write_file', { needsApproval: true }), (async () => 'ok') as never);
        const seen = vi.fn<AparteApprovalPolicy>(() => undefined);
        cfg.setApprovalPolicy(seen);
        cfg.ruleOnToolCall({ id: 'c', name: 'write_file', input: {} });
        expect(seen.mock.calls[0]?.[1]?.needsApproval).toBe(true);
        expect(cfg.reset).toBeTypeOf('function');
        cfg.reset();
        expect(cfg.getApprovalPolicy()).toBeNull();
    });
});

describe('the client honours the policy', () => {
    it('`allow` on a flagged tool runs it without ever pausing — no awaiting-approval on its row', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'write_file' }]);
        cfg.setApprovalPolicy(() => ({ verdict: 'allow' }));
        await run(cfg, el);
        expect(ran).toEqual(['c1']);
        expect(patches.map(p => p['status'])).not.toContain('awaiting-approval');
    });

    it('`deny` refuses with the policy\'s own reason, verbatim, and the model is not told a person refused', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        const reason = 'Plan mode: `read_file` is off in this test; only nothing runs.';
        cfg.setApprovalPolicy(() => ({ verdict: 'deny', reason }));
        await run(cfg, el);
        expect(ran).toEqual([]);
        expect(patches.map(p => p['status'])).toContain('rejected');
        // A decision already made is not a pause: no row ever said "awaiting approval",
        // and no `aparte-tool-approval-request` was raised for a question never asked.
        expect(patches.map(p => p['status'])).not.toContain('awaiting-approval');
        const results = patches.map(p => p['result']).filter(Boolean);
        expect(results).toContain(reason);
        expect(results.join(' ')).not.toContain('rejected by the user');
    });

    it('a `deny` with no reason still refuses in the policy\'s name — the model is never told a person did', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        cfg.setApprovalPolicy(() => ({ verdict: 'deny', reason: '  ' }));
        await run(cfg, el);
        expect(ran).toEqual([]);
        const results = patches.map(p => p['result']).filter(Boolean);
        expect(results).toContain('Tool execution was refused by the approval policy.');
        expect(results.join(' ')).not.toMatch(/rejected by the user/);
        // And the row knows it, for the person: the sentence above is the model's.
        expect(patches.find(p => p['status'] === 'rejected')?.['refusal']).toEqual({ by: 'policy' });
    });

    it('`ask` on an unflagged tool pauses it at the gate', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        cfg.setApprovalPolicy(() => ({ verdict: 'ask' }));
        // No presenter in this harness: the question cannot be shown, so the gate
        // aborts — which proves it was reached for a tool that never carried the flag.
        await run(cfg, el);
        expect(ran).toEqual([]);
        expect(patches.map(p => p['status'])).toContain('awaiting-approval');
    });

    it('a host\'s own approvalResolver is untouched by a policy — it already owns the decision', async () => {
        const { cfg, el, ran } = harness([{ id: 'c1', name: 'write_file' }]);
        // `allow` is the verdict that COULD bypass a host resolver — by turning the gate
        // off before it is consulted — so it is the one this test must use.
        const policy = vi.fn<AparteApprovalPolicy>(() => ({ verdict: 'allow' }));
        cfg.setApprovalPolicy(policy);
        const resolver = vi.fn(async () => ({ approved: true }));
        const client = new AparteClient({ config: cfg, autoRegister: false, approvalResolver: resolver });
        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
        expect(ran).toEqual(['c1']);
        expect(resolver, 'the host still gated the flagged call').toHaveBeenCalledOnce();
        expect(policy, 'and the policy was never consulted').not.toHaveBeenCalled();
    });

    it('a policy installed after the turn began governs the gate, not only the answer', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        // Installed from inside the turn: the transport is consulted before the tool
        // call is ruled on, so a policy set while it streams must already gate.
        const original = cfg.getTransport();
        cfg.setTransport({
            chat: (...args: unknown[]) => {
                cfg.setApprovalPolicy(() => ({ verdict: 'deny', reason: 'installed mid-turn' }));
                return (original as unknown as { chat: (...a: unknown[]) => unknown }).chat(...args);
            },
        } as never);
        await run(cfg, el);
        expect(ran).toEqual([]);
        expect(patches.map(p => p['status'])).not.toContain('awaiting-approval');
        expect(patches.map(p => p['result'])).toContain('installed mid-turn');
    });
});

describe('a policy that rules asynchronously', () => {
    // A ruling that needs a lookup (the page a browser tool acts on, a rules file, a policy
    // service). A promise was taken for a ruling with no verdict: the gate opened, and every call
    // ran unasked, a flagged one included.
    const later = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 5));

    it('`deny` refuses, with its reason, and nothing runs', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        cfg.setApprovalPolicy(() => later({ verdict: 'deny' as const, reason: 'Not on this site.' }));
        await run(cfg, el);
        expect(ran).toEqual([]);
        expect(patches.map((p) => p['result']).filter(Boolean)).toContain('Not on this site.');
    });

    it('`allow` runs a flagged tool, and nobody is asked', async () => {
        const { cfg, el, patches, ran } = harness([{ id: 'c1', name: 'write_file' }]);
        cfg.setApprovalPolicy(() => later({ verdict: 'allow' as const }));
        await run(cfg, el);
        expect(ran).toEqual(['c1']);
        expect(patches.map((p) => p['status'])).not.toContain('awaiting-approval');
    });

    // The gate rules, then the channel answers: one ruling for both. A lookup asked twice can
    // answer twice differently (the page navigated, a cache expired), and the second answer
    // decided: a call the first one refused ran.
    it('is asked once per call, and its first answer holds', async () => {
        const { cfg, el, ran } = harness([{ id: 'c1', name: 'read_file' }]);
        let asked = 0;
        cfg.setApprovalPolicy(() => (++asked === 1 ? later({ verdict: 'deny' as const, reason: 'Not on this site.' }) : later({ verdict: 'allow' as const })));
        await run(cfg, el);
        expect(ran).toEqual([]);
        expect(asked).toBe(1);
    });

    it('is ruled by ruleOnToolCallAsync; ruleOnToolCall, synchronous, asks rather than guess', async () => {
        const cfg = new AparteConfig();
        cfg.registerTool(tool('read_file'), (async () => 'ok') as never);
        cfg.setApprovalPolicy(() => later({ verdict: 'deny' as const, reason: 'no' }));
        await expect(cfg.ruleOnToolCallAsync({ id: 'c', name: 'read_file', input: {} })).resolves.toEqual({ verdict: 'deny', reason: 'no' });
        expect(cfg.ruleOnToolCall({ id: 'c', name: 'read_file', input: {} }).verdict).toBe('ask');
    });

    it('a ruling that fails asks a person rather than letting the call run', async () => {
        const cfg = new AparteConfig();
        cfg.registerTool(tool('read_file'), (async () => 'ok') as never);
        cfg.setApprovalPolicy(() => Promise.reject(new Error('policy service down')));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(cfg.ruleOnToolCallAsync({ id: 'c', name: 'read_file', input: {} })).resolves.toEqual({ verdict: 'ask' });
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});

// A tool's own time limit, declared where the page registers it, reaches the page's own loop.
describe('a tool with a time limit of its own, in the page', () => {
    it('is abandoned once its limit is up, and the reply ends', async () => {
        const { cfg, el, patches } = harness([{ id: 'c1', name: 'slow_tool' }]);
        let seen: AbortSignal | undefined;
        cfg.registerTool(tool('slow_tool', { timeoutMs: 20 }), ((_c: unknown, signal: AbortSignal) => { seen = signal; return new Promise(() => {}); }) as never);
        const ended = await Promise.race([run(cfg, el).then(() => 'ended', () => 'ended'), new Promise((r) => setTimeout(() => r('still waiting'), 400))]);
        expect(ended).toBe('ended');
        expect(seen?.aborted).toBe(true);
        expect(patches.map((p) => p['status'])).toContain('aborted');
    });
});

