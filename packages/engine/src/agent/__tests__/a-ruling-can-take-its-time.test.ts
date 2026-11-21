/**
 * A call's ruling can take its time: `needsApproval` may answer with a promise.
 *
 * A policy that needs a lookup (the page a browser tool acts on, a rules file, a policy service)
 * could not await it: a promise was read as a truthy ruling, or ignored. While it rules, the calls
 * after it wait, as they wait for a person's answer, so nothing the model asked for after a call
 * runs before that call is ruled. A ruling that fails asks a person rather than letting the call
 * run.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import type { StreamRunEvent, StreamToolConfig } from '../stream-events';
import { ask, done, scripted, toolUse } from './sub-agent-script';

const later = <T>(value: T, ms = 15): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function run(config: (name: string) => StreamToolConfig | undefined, parallelTools = false) {
    const events: StreamRunEvent[] = [];
    const asked: string[] = [];
    const { transportCall } = scripted({ parent: [[toolUse('w1', 'write'), toolUse('r1', 'read')], [done]] });
    await runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), transportCall,
        toolLookup: (name) => async () => ({ content: `${name} done` }),
        toolConfigLookup: config,
        parallelTools,
        approvalResolver: async (call) => { asked.push(call.id); return { approved: false, reason: 'no' }; },
        emitter: (e) => { events.push(e); },
        signal: new AbortController().signal,
    });
    const seen = events
        .filter((e) => e.type === 'tool-resolved' || e.type === 'tool-awaiting-approval' || e.type === 'tool-rejected' || e.type === 'tool-start')
        .map((e) => `${e.type}:${(e as { toolCallId: string }).toolCallId}`);
    return { seen, asked };
}

describe('a ruling that takes its time', () => {
    it('asking, the call waits for a person', async () => {
        const { seen, asked } = await run((name) => (name === 'write' ? { needsApproval: () => later('ask' as const) } : undefined));
        expect(asked).toEqual(['w1']);
        expect(seen).toContain('tool-awaiting-approval:w1');
    });

    it('allowing, the call runs, and asks nobody', async () => {
        const { seen, asked } = await run((name) => (name === 'write' ? { needsApproval: () => later(false) } : undefined));
        expect(asked).toEqual([]);
        expect(seen).toContain('tool-resolved:w1');
        expect(seen).not.toContain('tool-awaiting-approval:w1');
    });

    it('failing, the call asks a person rather than running unasked', async () => {
        const { asked, seen } = await run((name) => (name === 'write' ? { needsApproval: () => Promise.reject(new Error('policy service down')) } : undefined));
        expect(asked).toEqual(['w1']);
        expect(seen).not.toContain('tool-resolved:w1');
    });

    it('holds the calls after it in a step until it is ruled', async () => {
        const order: string[] = [];
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'write'), toolUse('r1', 'read')], [done]] });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (name) => async () => { order.push(`${name} ran`); return { content: 'ok' }; },
            toolConfigLookup: (name) => (name === 'write'
                ? { parallel: true, needsApproval: () => later(false, 30).then((v) => { order.push('write ruled'); return v; }) }
                : { parallel: true }),
            parallelTools: true,
            emitter: () => {},
            signal: new AbortController().signal,
        });
        // The read, asked for after the write, waited for the write's ruling before it ran.
        expect(order.indexOf('read ran')).toBeGreaterThan(order.indexOf('write ruled'));
        expect(order).toContain('write ran');
    });
});
