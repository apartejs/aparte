// @vitest-environment jsdom
/**
 * An advisor writes while the AI waits on an approval.
 *
 * The server paused the reply on a call the person must approve; meanwhile the app
 * appends an advisor's message. When the person answers, the turn resumes into its own
 * reply — not into the advisor's message, which became the last one — and the advisor's
 * message stays as it was. Run on the real viewport, whose 1-argument writes are the ones
 * that used to follow "the last message".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    getMessages(): AparteMessage[];
    getMessage(id: string): AparteMessage | undefined;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('a human message while an approval waits', () => {
    it('lets the answered turn finish in its own reply', async () => {
        const vp = document.createElement('aparte-chat-viewport') as unknown as Viewport;
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));

        const ids: string[] = [];
        const streamRunner = async (opts: AparteStreamRunOptions) => {
            ids.push(opts.messageId);
            opts.emitter({ type: 'run-start' });
            if (ids.length === 1) {
                opts.emitter({ type: 'tool-start', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
                opts.emitter({ type: 'tool-awaiting-approval', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
                opts.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'c1', name: 'delete_file', input: { path: 'a' }, reason: 'approval' }], ticket: 'T' } as never);
                return undefined;
            }
            opts.emitter({ type: 'tool-approved', toolCallId: 'c1' });
            opts.emitter({ type: 'tool-resolved', toolCallId: 'c1', result: 'deleted' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Done.' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        };
        let answer: ((v: { approved: boolean }) => void) | undefined;
        const config = new AparteConfig();
        config.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        config.setKeyProvider(() => 'k');
        const client = new AparteClient({
            config, autoRegister: false, targetResolver: () => vp as never, streamRunner,
            approvalResolver: () => new Promise((resolve) => { answer = resolve; }),
        } as never);

        const sending = (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'delete a' } }),
        );
        await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
        vp.appendMessage({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'Approving is fine.', timestamp: Date.now() });
        answer!({ approved: true });
        await sending;

        const reply = vp.getMessage(ids[0]!)!;
        const text = (reply.segments ?? []).filter((s) => s.type === 'text').map((s) => (s as { content: string }).content).join('');
        expect(text).toBe('Done.');
        const h1 = vp.getMessage('h1')!;
        expect(h1.segments ?? []).toEqual([]);
        expect(h1.content).toBe('Approving is fine.');
        client.stop();
    });
});
