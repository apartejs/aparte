// @vitest-environment jsdom
/**
 * One writer for the wait, chosen by the binding.
 *
 * A wrapper that draws its own skeleton computes `waiting = loading || hostLoading` and
 * writes the viewport's attribute from it. The host wrote the same attribute directly,
 * so with the consumer's own `loading` prop on, a `setLoading(false)` from the controller
 * removed it — and `aria-busy` with it — while the wrapper was still drawing the wait and
 * still holding the composer shut. Two writers, one attribute, no agreement.
 *
 * A binding that says nothing about loading has no other way of knowing, so there the
 * host keeps writing it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';
// From the module that defines them: the types barrel carries the element/segment
// surface, not the storage contract.
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

const conv: AparteConversation = {
    id: 'c1', title: 'One', createdAt: 1, updatedAt: 1,
    messages: [{ id: 'm1', role: 'user', timestamp: 1, content: 'hi' } as AparteMessage],
};

async function setup(withOnLoadingChange: boolean) {
    let release: () => void = () => {};
    const adapter: AparteStorageAdapter = {
        async loadAll() { return [conv]; },
        async loadMeta() { const { messages: _m, ...meta } = conv; return [meta]; },
        async loadFull() { await new Promise<void>((r) => { release = r; }); return conv; },
        async save() {}, async delete() {},
    };
    const config = new AparteConfig();
    const manager = new AparteConversationManager(adapter);
    config.setConversationManager(manager);
    await manager.init();

    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { setLoading?: unknown }).setLoading).toBe('function'));

    let messages: AparteMessage[] = [];
    const heard: boolean[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
        ...(withOnLoadingChange ? { onLoadingChange: (on: boolean) => heard.push(on) } : {}),
    };
    const host = new AparteChatHost(binding, { config });
    const teardown = host.bind();
    return { viewport, heard, teardown, release: () => release() };
}

describe('the transcript’s wait', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('is the wrapper’s to draw when the binding asked to hear about it', async () => {
        const { viewport, heard, teardown, release } = await setup(true);
        window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: 'c1' } }));
        await vi.waitFor(() => expect(heard).toContain(true));
        expect(viewport.hasAttribute('loading'), 'the host does not also write it').toBe(false);
        release();
        await vi.waitFor(() => expect(heard).toEqual([true, false]));
        teardown();
    });

    it('is written on the viewport when the binding has no way of hearing it', async () => {
        const { viewport, teardown, release } = await setup(false);
        window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: 'c1' } }));
        await vi.waitFor(() => expect(viewport.hasAttribute('loading')).toBe(true));
        release();
        await vi.waitFor(() => expect(viewport.hasAttribute('loading')).toBe(false));
        teardown();
    });
});
