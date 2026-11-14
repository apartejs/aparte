// @vitest-environment node
/**
 * A server loop keeps the order of a tool's calls unless the tool says `parallel: true`
 * (#202): `edit_file` then `run_command` in one reply runs the command on the edited file.
 * A server tool's `parallel` reaches the loop the way its `needsApproval` does, and
 * `createAparteAgentHandler`'s `parallelTools` the way `maxTurns` does: `false` runs every
 * call one after another, whatever its tool says.
 */
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createAparteAgentHandler, type AparteAgentHandlerOptions, type AparteAgentTool } from '../agent-handler.js';
import { readNdjson } from '../../utils/ndjson.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteTool } from '../../types/tools.js';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const SECRET = 's'.repeat(32);

const settle = () => new Promise((r) => setTimeout(r, 0));

/** A provider whose first turn calls the given tools, and whose next one answers. */
function providerCalling(calls: { id: string; name: string }[]): AparteAIProvider {
    let turn = 0;
    return {
        id: 'fake', name: 'Fake',
        async chat() {
            const events = turn++ === 0
                ? [...calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: {} })), { type: 'done' }]
                : [{ type: 'text', delta: 'Done.' }, { type: 'done' }];
            return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
        },
    } as unknown as AparteAIProvider;
}

/** Server tools whose handlers answer once the test releases them. */
function heldTools(defs: AparteTool[]) {
    const started: string[] = [];
    const running = new Set<string>();
    const releases = new Map<string, () => void>();
    const tools: AparteAgentTool[] = defs.map((tool) => ({
        tool,
        handler: async (call) => {
            started.push(call.id);
            running.add(call.id);
            await new Promise<void>((resolve) => { releases.set(call.id, resolve); });
            running.delete(call.id);
            return { toolCallId: call.id, content: `ran ${call.id}` };
        },
    }));
    const release = async (id: string) => {
        releases.get(id)!();
        await settle();
    };
    return { tools, started, running, release };
}

const def = (name: string, extra: Partial<AparteTool> = {}): AparteTool => ({ name, description: name, inputSchema: { type: 'object' }, ...extra });

function serve(provider: AparteAIProvider, tools: AparteAgentTool[], extra: Partial<AparteAgentHandlerOptions> = {}) {
    const handler = createAparteAgentHandler({ providers: { fake: provider }, authorize: () => true, secret: SECRET, tools, crypto: subtle, ...extra });
    const body = { v: 1, providerId: 'fake', messageId: 'm1', request: { messages: [{ role: 'user', content: 'fix it' }], modelId: 'x', stream: true } };
    return handler(new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
}

type Line = { type: string; toolCallId?: string; queued?: true };

async function lines(res: Response): Promise<Line[]> {
    const out: Line[] = [];
    for await (const line of readNdjson<Line>(res.body!)) out.push(line);
    return out;
}
const drain = async (res: Response): Promise<string[]> => (await lines(res)).map((l) => l.type);

describe('createAparteAgentHandler — the order of a step\'s tool calls', () => {
    it('runs run_command once edit_file has settled when neither says parallel', async () => {
        const h = heldTools([def('edit_file'), def('run_command')]);
        const out = lines(await serve(providerCalling([{ id: 'e', name: 'edit_file' }, { id: 'c', name: 'run_command' }]), h.tools));

        await settle();
        expect(h.started).toEqual(['e']);
        await h.release('e');
        expect(h.started).toEqual(['e', 'c']);
        await h.release('c');
        const wire = await out;
        expect(wire.at(-1)!.type).toBe('run-done');
        // The command's row went down queued, and the moment it went on after it.
        const at = (match: (l: Line) => boolean) => wire.findIndex(match);
        expect(wire.find((l) => l.type === 'tool-start' && l.toolCallId === 'c')).toMatchObject({ queued: true });
        expect(at((l) => l.type === 'tool-running' && l.toolCallId === 'c')).toBeGreaterThan(at((l) => l.type === 'tool-resolved' && l.toolCallId === 'e'));
    });

    it('runs together the calls of tools that say parallel: true', async () => {
        const h = heldTools([def('read_file', { parallel: true })]);
        const out = drain(await serve(providerCalling([{ id: 'r1', name: 'read_file' }, { id: 'r2', name: 'read_file' }]), h.tools));

        await settle();
        expect([...h.running].sort()).toEqual(['r1', 'r2']);
        await h.release('r1');
        await h.release('r2');
        expect((await out).at(-1)).toBe('run-done');
    });

    it('runs them one after another with parallelTools: false', async () => {
        const h = heldTools([def('read_file', { parallel: true })]);
        const out = drain(await serve(providerCalling([{ id: 'r1', name: 'read_file' }, { id: 'r2', name: 'read_file' }]), h.tools, { parallelTools: false }));

        await settle();
        expect(h.started).toEqual(['r1']);
        await h.release('r1');
        expect(h.started).toEqual(['r1', 'r2']);
        await h.release('r2');
        expect((await out).at(-1)).toBe('run-done');
    });
});
