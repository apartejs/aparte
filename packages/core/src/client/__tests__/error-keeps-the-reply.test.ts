/**
 * An error must not erase the reply that already arrived.
 *
 * `_handleLifecycleError` passed `segments: [errorSegment]`, which REPLACED
 * everything already streamed and rendered — text, the thinking block, artifacts,
 * resolved tool calls — the moment a provider emitted a mid-stream `error` event or
 * a tool handler threw anything that was not an `AbortError`.
 *
 * It is the same defect as "Stop erased the reply", fixed one release earlier on
 * the abort path and left standing on the error path. A partial answer plus an
 * error is the truth; an empty bubble with an error in it is a lie about what the
 * model said.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage, AparteStreamEvent } from '../../types/index.js';

/** A provider that streams some text and then fails, the way a real one does. */
function failingMidStreamProvider(id = 'mock') {
    return {
        id,
        getMetadata: () => ({ id, name: id }),
        getModels: () => [{ id: 'm', name: 'M', capabilities: ['streaming'] }],
        chat: async () => new ReadableStream<AparteStreamEvent>({
            start(c) {
                c.enqueue({ type: 'text', delta: 'Here is the first half' } as AparteStreamEvent);
                c.enqueue({ type: 'error', message: 'vendor exploded' } as AparteStreamEvent);
                c.close();
            },
        }),
    } as never;
}

describe('a mid-stream error keeps what already streamed', () => {
    let viewport: HTMLElement & { getMessages(): AparteMessage[] };

    beforeEach(async () => {
        document.body.innerHTML = '<aparte-chat-viewport id="chat"></aparte-chat-viewport>';
        viewport = document.getElementById('chat') as never;
        await vi.waitFor(() => expect(typeof viewport.getMessages).toBe('function'));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('renders the partial text AND the error, not the error alone', async () => {
        const config = new AparteConfig();
        config.registerAIProvider(failingMidStreamProvider());
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        new AparteClient({ config, autoRegister: false }).start();

        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'chat' },
            bubbles: true,
            composed: true,
        }));

        await vi.waitFor(() => {
            const assistant = viewport.getMessages().find((m) => m.role === 'assistant');
            expect(assistant?.status).toBe('error');
        });

        const assistant = viewport.getMessages().find((m) => m.role === 'assistant')!;
        const types = (assistant.segments ?? []).map((s) => s.type);
        expect(types, 'the error is reported').toContain('error');
        expect(types, 'and the text that had already arrived survives').toContain('text');

        const text = (assistant.segments ?? [])
            .map((s) => (s as { content?: string }).content ?? '')
            .join('');
        expect(text).toContain('Here is the first half');
    });
});
