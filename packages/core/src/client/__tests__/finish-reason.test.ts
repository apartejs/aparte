/**
 * The finish reason travels from the run to the message and to the done event.
 *
 * A reply the model stopped at its length limit looks exactly like a finished one, so the
 * reason has to reach the places that can say so: the message (persisted, so a reload
 * still knows), the bubble drawn from it, and `aparte-message-done` for an app that reacts.
 * The runner here stands in for any loop — inline, injected, or a server's replayed lines.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

function chat() {
    const messages: AparteMessage[] = [];
    const done: unknown[] = [];
    const el = document.createElement('div');
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: () => {}, updateSegment: () => {}, updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    el.addEventListener('aparte-message-done', (e) => done.push((e as CustomEvent).detail));
    document.body.appendChild(el);
    return { el, messages, done };
}

async function turn(runDone: { finishReason?: 'length' | 'stop' }) {
    const { el, messages, done } = chat();
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const streamRunner = async (opts: AparteStreamRunOptions) => {
        opts.emitter({ type: 'run-start' });
        opts.emitter({ type: 'text-delta', delta: 'Half an ans' });
        opts.emitter({ type: 'text-flush' });
        opts.emitter({ type: 'run-done', ...runDone });
        return undefined;
    };
    const c = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never, streamRunner } as never);
    await (c as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
    return { messages, done };
}

describe('finishReason', () => {
    it('is written onto the message and carried by aparte-message-done', async () => {
        const { messages, done } = await turn({ finishReason: 'length' });
        expect(messages.at(-1)).toMatchObject({ role: 'assistant', status: 'completed', finishReason: 'length' });
        expect(done).toEqual([expect.objectContaining({ role: 'assistant', finishReason: 'length' })]);
    });

    it('is left off both when the run reported none', async () => {
        const { messages, done } = await turn({});
        expect(messages.at(-1)).not.toHaveProperty('finishReason');
        expect(done[0]).not.toHaveProperty('finishReason');
    });
});
