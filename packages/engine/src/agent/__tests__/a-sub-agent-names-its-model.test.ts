/**
 * A sub-agent names the model it runs on: `agent-start` carries `model`.
 *
 * A host lets a sub-agent run on another model than its conversation (a small local one beside
 * the main). Nothing carried it, and a host put it in the name ("Reader · qwen3:8b"), which a
 * host matching lines by name then had to strip.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { ask, done, scripted, text, toolUse } from './sub-agent-script';

async function startOf(model?: string) {
    const events: StreamRunEvent[] = [];
    const { transportCall } = scripted({ parent: [[toolUse('d1', 'delegate')], [done]], 'qwen3:8b': [[text('ok'), done]] });
    const delegate: StreamToolHandler = async (_call, signal, run) => {
        const r = await runSubAgent(run!, { name: 'Reader', request: ask('qwen3:8b'), ...(model ? { model } : {}) }, signal);
        return { content: r.text };
    };
    await runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), transportCall,
        toolLookup: () => delegate,
        emitter: (e) => { events.push(e); },
        signal: new AbortController().signal,
    });
    return events.find((e) => e.type === 'agent-start');
}

describe('a sub-agent\'s model', () => {
    it('is the model its request asks, on its agent-start', async () => {
        expect(await startOf()).toMatchObject({ type: 'agent-start', name: 'Reader', model: 'qwen3:8b' });
    });

    it('is the name the tool gives it, when it gives one', async () => {
        expect(await startOf('Qwen 3 8B')).toMatchObject({ model: 'Qwen 3 8B' });
    });
});
