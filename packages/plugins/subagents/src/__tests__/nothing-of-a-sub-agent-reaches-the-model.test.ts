/**
 * Nothing of a sub-agent reaches the model.
 *
 * The lane is kept on the call that opened it, in a field the history never reads: the next
 * turn sends the reply's own text, the call, and the call's result — the sub-agent's words,
 * reasoning and tool calls stay on the page. Driven end to end: a real client runs the turn
 * in our own loop, the tool opens a real sub-agent (`runSubAgent`), and the history of the
 * next send is built the way the client builds it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    AparteClient,
    AparteConfig,
    runSubAgent,
    type AparteChatMessage,
    type AparteMessage,
    type AparteTool,
    type AparteToolHandler,
} from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { callIn, chat, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
});

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

const tool = (name: string): AparteTool => ({ name, description: name, inputSchema: { type: 'object', properties: {} } } as AparteTool);

describe('nothing of a sub-agent reaches the model', () => {
    it('the next send carries the call and its result, and none of the lane', async () => {
        const config = new AparteConfig();
        config.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        config.setKeyProvider(() => 'k');
        const readFile: AparteToolHandler = async (call) => ({ toolCallId: call.id, content: 'SECRET FILE BODY' });
        const delegate: AparteToolHandler = async (call, signal, context) => {
            await runSubAgent(context!.run!, {
                name: 'Researcher',
                request: { modelId: 'child', messages: [{ role: 'user', content: 'read it' }] },
            }, signal);
            return { toolCallId: call.id, content: 'The parser is fine.' };
        };
        config.registerTool(tool('read_file'), readFile);
        config.registerTool(tool('delegate'), delegate);
        config.setTransport(transport({
            m: [
                [{ type: 'text', delta: 'Let me delegate.' }, { type: 'tool_use', id: 'c1', name: 'delegate', input: {} }],
                [{ type: 'text', delta: 'All good.' }],
            ],
            child: [
                [{ type: 'thinking', delta: 'CHILD REASONING' }, { type: 'text', delta: 'CHILD WORDS' }, { type: 'tool_use', id: 'r1', name: 'read_file', input: {} }],
                [{ type: 'text', delta: 'CHILD CONCLUSION' }],
            ],
        }) as never);
        stop = setupSubagents({}, config);

        const c = chat({ config });
        const client = new AparteClient({ config, autoRegister: false });
        const internals = client as unknown as {
            _streamTurn: (...a: unknown[]) => Promise<void>;
            _buildMessages: (content: string, target: unknown) => AparteChatMessage[];
        };
        await internals._streamTurn(c.viewport, 'a1', config.getAIProvider('mock'), [{ role: 'user', content: 'Go' }], 'm', 'k');

        // The lane is on the page, on the call.
        const lane = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(textOfAll(lane.segments)).toContain('CHILD CONCLUSION');
        expect(callIn(lane.segments, 'r1')).toBeDefined();

        // The next send.
        const sent = internals._buildMessages('Next question', c.viewport);
        const wire = JSON.stringify(sent);
        for (const secret of ['CHILD REASONING', 'CHILD WORDS', 'CHILD CONCLUSION', 'SECRET FILE BODY', 'read_file', 'r1']) {
            expect(wire).not.toContain(secret);
        }
        const calls = sent.flatMap((m) => m.toolCalls ?? []);
        expect(calls.map((call) => [call.id, call.name])).toEqual([['c1', 'delegate']]);
        const answers = sent.filter((m) => m.role === 'tool');
        expect(answers.map((m) => [m.toolCallId, m.content])).toEqual([['c1', 'The parser is fine.']]);
        expect(sent.at(-1)).toMatchObject({ role: 'user', content: 'Next question' });
        expect((c.viewport.getMessage('a1') as AparteMessage).segments!.map((s) => s.type)).toEqual(['text', 'tool_call', 'text']);
    });
});
