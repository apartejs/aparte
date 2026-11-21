/**
 * The text the parser still holds is kept when the run ends on an error.
 *
 * The parser holds the last characters of an open fence, a lone backtick or the start of a tag
 * until more arrives, and hands them over at the end of a call (`text-flush`), at the next call,
 * or when the run ends (apartejs/aparte#275). An error ended the run past all of those: the engine
 * throws before its `text-flush`, and the client's error path never reached the adapter. A code
 * block cut by a mid-stream error ("context length exceeded", a vendor's 500) lost its last
 * characters on screen and in storage, beside the error that said why it stopped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage, AparteStreamEvent } from '../../types/index.js';
import type { AparteStreamRunner } from '../stream-adapter.js';

/** A provider that streams `text` and then fails mid-stream. */
function failingAfter(text: string) {
    return {
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'mock' }),
        getModels: () => [{ id: 'm', name: 'M', capabilities: ['streaming'] }],
        chat: async () => new ReadableStream<AparteStreamEvent>({
            start(c) {
                c.enqueue({ type: 'text', delta: text } as AparteStreamEvent);
                c.enqueue({ type: 'error', message: 'context length exceeded' } as AparteStreamEvent);
                c.close();
            },
        }),
    } as never;
}

describe('a run that ends on an error keeps the text the parser held', () => {
    let viewport: HTMLElement & { getMessages(): AparteMessage[] };
    let client: AparteClient | null = null;

    beforeEach(async () => {
        document.body.innerHTML = '<aparte-chat-viewport id="chat"></aparte-chat-viewport>';
        viewport = document.getElementById('chat') as never;
        await vi.waitFor(() => expect(typeof viewport.getMessages).toBe('function'));
    });

    afterEach(() => {
        // Stopped, or it answers the next test's send too.
        client?.stop();
        client = null;
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
        vi.restoreAllMocks();
    });

    async function replyAfter(text: string, runner?: AparteStreamRunner): Promise<string> {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const config = new AparteConfig();
        config.registerAIProvider(failingAfter(text));
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        client = new AparteClient({ config, autoRegister: false, ...(runner ? { streamRunner: runner } : {}) });
        client.start();
        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'chat' },
            bubbles: true,
            composed: true,
        }));
        await vi.waitFor(() => expect(viewport.getMessages().find((m) => m.role === 'assistant')?.status).toBe('error'));
        const reply = viewport.getMessages().find((m) => m.role === 'assistant')!;
        return (reply.segments ?? [])
            .filter((s) => s.type !== 'error')
            .map((s) => String((s as { content?: unknown }).content ?? ''))
            .join('');
    }

    it('a code block cut by the error keeps its last characters', async () => {
        expect(await replyAfter('```js\nconst a = 1;')).toContain('const a = 1;');
    });

    it('a sentence ending on inline code keeps it', async () => {
        expect(await replyAfter('La valeur est `42`')).toContain('`42`');
    });

    it('a runner of the app\'s own that fails without a text-flush loses nothing either', async () => {
        // A server loop relayed by hand: its text, then a failure, and no flush of its own.
        const runner: AparteStreamRunner = async ({ emitter }) => {
            emitter({ type: 'run-start' });
            emitter({ type: 'turn-start' });
            emitter({ type: 'text-delta', delta: 'Le fichier `a.ts`' });
            throw new Error('the server went away');
        };
        expect(await replyAfter('', runner)).toContain('`a.ts`');
    });
});
