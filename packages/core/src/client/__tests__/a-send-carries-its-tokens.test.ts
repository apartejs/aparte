import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteDirectTransport } from '../../transport/direct-transport.js';
import type { AparteChatRequest, AparteMessage } from '../../types/index.js';

function harness() {
    const seen: AparteChatRequest[] = [];
    const appended: AparteMessage[] = [];
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'p',
        getMetadata: () => ({ id: 'p', name: 'P' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        chat: async (request: AparteChatRequest) => { seen.push(request); return ''; },
    } as never);
    cfg.setModelConfig({ defaultProvider: 'p', defaultModel: 'm' });
    cfg.setKeyProvider(() => '');
    cfg.setTransport(new AparteDirectTransport({ byok: true }));
    const el = document.createElement('div') as unknown as Record<string, unknown>;
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendToken', 'completeMessage']) el[m] = () => {};
    el['appendMessage'] = (message: AparteMessage) => { appended.push(message); };
    el['getMessages'] = () => [];
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
    const send = (detail: object) => (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail }));
    const edit = (detail: object) => (client as unknown as { _handleEdit: (e: CustomEvent) => Promise<void> })._handleEdit(new CustomEvent('aparte-edit', { detail }));
    return { seen, appended, send, edit, el };
}

const tokens = [{ label: 'Paul', text: '@paul', start: 0, end: 5, data: { id: 1 } }];

describe('an edit', () => {
    function edited(message: AparteMessage) {
        const parts = harness();
        parts.el['getMessages'] = () => [message];
        parts.el['updateMessage'] = (_id: string, patch: Partial<AparteMessage>) => { Object.assign(message, patch); };
        parts.el['truncateResponsesAfter'] = () => {};
        return parts;
    }
    const user = (more: Partial<AparteMessage>): AparteMessage => ({ id: 'u', role: 'user', content: '@paul hi', timestamp: 1, ...more });

    it('keeps the tokens the text still holds, at their new places, and sends them', async () => {
        const message = user({ tokens });
        const { seen, edit } = edited(message);
        await edit({ messageId: 'u', content: 'dear @paul' });
        const moved = [{ ...tokens[0]!, start: 5, end: 10 }];
        expect(message.tokens).toEqual(moved);
        expect(seen[0]!._meta).toEqual({ tokens: moved });
    });

    it('lets go of a token whose text is gone', async () => {
        const message = user({ tokens });
        const { seen, edit } = edited(message);
        await edit({ messageId: 'u', content: 'nobody here' });
        expect(message.tokens).toEqual([]);
        expect('_meta' in seen[0]!).toBe(false);
    });

    it('adds nothing to a message that had none', async () => {
        const message = user({});
        const { seen, edit } = edited(message);
        await edit({ messageId: 'u', content: 'plain' });
        expect('tokens' in message).toBe(false);
        expect('_meta' in seen[0]!).toBe(false);
    });
});

describe('what a send carries beside its text', () => {
    it('reaches the user message and the request', async () => {
        const { seen, appended, send } = harness();
        await send({ content: '@paul', tokens, meta: { ticket: 12 } });
        expect(appended[0]!.tokens).toEqual(tokens);
        expect(appended[0]!.metadata).toEqual({ ticket: 12 });
        expect(seen[0]!._meta).toEqual({ ticket: 12, tokens });
    });

    it('leaves a plain send as it was', async () => {
        const { seen, appended, send } = harness();
        await send({ content: 'hello' });
        expect('tokens' in appended[0]!).toBe(false);
        expect('metadata' in appended[0]!).toBe(false);
        expect('_meta' in seen[0]!).toBe(false);
    });
});
