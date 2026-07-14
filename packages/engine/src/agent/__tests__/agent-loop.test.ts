import { describe, it, expect, vi } from 'vitest';
import { runAgent, type AgentProvider, type AgentMessage } from '../agent-loop';
import { ToolRegistry, type Tool, type ToolHandler } from '../tool';
import { EventType, type AGUIEvent } from '../events';

/** Provider that replays a scripted list of assistant responses, one per call. */
function scripted(responses: string[]): { provider: AgentProvider; calls: Array<Parameters<AgentProvider['chat']>[0]> } {
    const calls: Array<Parameters<AgentProvider['chat']>[0]> = [];
    let i = 0;
    return {
        calls,
        // Snapshot `messages` at call time — the loop mutates the array afterwards.
        provider: { chat: async (opts) => { calls.push({ ...opts, messages: [...opts.messages] }); return responses[i++] ?? ''; } },
    };
}

function tool(name: string, handler: ToolHandler): Tool {
    return { descriptor: { name, description: '', parameters: { type: 'object', properties: {} } }, handler };
}

function registryWith(...tools: Tool[]): ToolRegistry {
    const r = new ToolRegistry();
    r.registerAll(tools);
    return r;
}

function recorder(): { emitter: (e: AGUIEvent) => void; events: AGUIEvent[]; types: () => string[] } {
    const events: AGUIEvent[] = [];
    return { events, emitter: (e) => events.push(e), types: () => events.map(e => e.type) };
}

describe('runAgent — control flow', () => {
    it('returns the assistant text directly when there is no tool call', async () => {
        const { provider } = scripted(['Just an answer.']);
        const res = await runAgent({ userMessage: 'hi', provider, registry: registryWith() });
        expect(res.finalMessage).toBe('Just an answer.');
        expect(res.iterations).toBe(1);
        expect(res.toolCalls).toEqual([]);
    });

    it('executes a tool call, feeds the result back, then finishes', async () => {
        const echo = tool('echo', async (args) => `echoed:${args['x']}`);
        const { provider, calls } = scripted(['[echo(x="hi")]', 'All done.']);
        const res = await runAgent({ userMessage: 'go', provider, registry: registryWith(echo) });

        expect(res.finalMessage).toBe('All done.');
        expect(res.toolCalls).toEqual([{ name: 'echo', args: { x: 'hi' }, result: 'echoed:hi' }]);
        // The tool result was appended as a role:'tool' message before the 2nd LLM call.
        const secondCallMessages = calls[1]!.messages;
        expect(secondCallMessages.some(m => m.role === 'tool' && m.content === 'echoed:hi')).toBe(true);
    });

    it('reports a FAILED result for an unregistered tool (and keeps going)', async () => {
        const { provider } = scripted(['[nope()]', 'recovered']);
        const res = await runAgent({ userMessage: 'go', provider, registry: registryWith() });
        expect(res.toolCalls[0]!.result).toMatch(/FAILED: tool "nope" not registered/);
        expect(res.finalMessage).toBe('recovered');
    });

    it('turns a throwing tool handler into a FAILED result', async () => {
        const boom = tool('boom', async () => { throw new Error('kaboom'); });
        const { provider } = scripted(['[boom()]', 'ok']);
        const res = await runAgent({ userMessage: 'go', provider, registry: registryWith(boom) });
        expect(res.toolCalls[0]!.result).toBe('FAILED: kaboom');
    });

    it('halts after errorHaltThreshold consecutive tool errors', async () => {
        const bad = tool('bad', async () => 'FAILED: nope');
        const { provider } = scripted(['[bad()]', '[bad()]', '[bad()]', '[bad()]', 'never']);
        const rec = recorder();
        const res = await runAgent({
            userMessage: 'go', provider, registry: registryWith(bad),
            errorHaltThreshold: 3, maxIterations: 10, emitter: rec.emitter,
        });
        expect(res.toolCalls.length).toBeLessThan(5); // stopped early
        expect(rec.events.some(e => e.type === 'RUN_ERROR' && (e as any).code === 'TOOL_ERROR_THRESHOLD')).toBe(true);
    });

    it('forces a final synthesis (no tools) when maxIterations is hit', async () => {
        const loop = tool('loop', async () => 'again');
        const { provider, calls } = scripted(['[loop()]', '[loop()]', 'SYNTH']);
        const res = await runAgent({ userMessage: 'go', provider, registry: registryWith(loop), maxIterations: 2 });
        expect(res.finalMessage).toBe('SYNTH');
        // The forced final call exposes NO tools.
        expect(calls[calls.length - 1]!.tools).toEqual([]);
    });

    it('throws AbortError and emits RUN_ERROR when the signal is already aborted', async () => {
        const { provider } = scripted(['whatever']);
        const rec = recorder();
        await expect(runAgent({
            userMessage: 'go', provider, registry: registryWith(),
            signal: AbortSignal.abort(), emitter: rec.emitter,
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(rec.events.some(e => e.type === 'RUN_ERROR' && (e as any).code === 'ABORTED')).toBe(true);
    });
});

describe('runAgent — messages, context & events', () => {
    it('builds system + history + user into the first LLM call', async () => {
        const { provider, calls } = scripted(['done']);
        const history: AgentMessage[] = [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }];
        await runAgent({ userMessage: 'now', provider, registry: registryWith(), systemPrompt: 'SYS', history });
        const msgs = calls[0]!.messages;
        expect(msgs[0]).toEqual({ role: 'system', content: 'SYS' });
        expect(msgs.map(m => m.content)).toEqual(['SYS', 'earlier', 'reply', 'now']);
    });

    it('passes the tool context (conversationId, preferences, signal) to handlers', async () => {
        const handler = vi.fn<ToolHandler>(async () => 'ok');
        const { provider } = scripted(['[probe()]', 'end']);
        const prefs = { enabledTools: new Set(['probe']) };
        await runAgent({
            userMessage: 'go', provider, registry: registryWith(tool('probe', handler)),
            conversationId: 'conv-1', preferences: prefs,
        });
        const ctx = handler.mock.calls[0]![1];
        expect(ctx.conversationId).toBe('conv-1');
        expect(ctx.preferences).toBe(prefs);
        expect(ctx.userMessage).toBe('go');
    });

    it('emits AG-UI lifecycle events: RUN_STARTED first, RUN_FINISHED last, with the tool-call quartet', async () => {
        const echo = tool('echo', async () => 'r');
        const { provider } = scripted(['[echo()]', 'fin']);
        const rec = recorder();
        await runAgent({ userMessage: 'go', provider, registry: registryWith(echo), emitter: rec.emitter });
        const t = rec.types();
        expect(t[0]).toBe(EventType.RUN_STARTED);
        expect(t[t.length - 1]).toBe(EventType.RUN_FINISHED);
        for (const e of ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT']) {
            expect(t).toContain(e);
        }
    });

    it('only exposes marker-active tools to the provider', async () => {
        const r = new ToolRegistry();
        r.register({ ...tool('always', async () => 'x') });
        r.register({ ...tool('off', async () => 'x'), marker: { mode: 'disabled' } });
        const { provider, calls } = scripted(['done']);
        await runAgent({ userMessage: 'go', provider, registry: r });
        expect(calls[0]!.tools.map(d => d.name)).toEqual(['always']);
    });
});
