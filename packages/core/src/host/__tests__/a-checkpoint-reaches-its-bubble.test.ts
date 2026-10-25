// @vitest-environment jsdom
/**
 * The separator under a framework: the list is the framework's, the bubbles are drawn from
 * it, and a compaction writes its checkpoint onto a message that is not the last.
 *
 * `syncBubbles` re-syncs the last message on every render and every other one once, so a
 * write to an earlier message stayed in the list and never reached the screen. These drive
 * the real host over a real viewport and real bubbles, with the framework's job (creating
 * and keeping the bubbles) done by the test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig } from '../../config/aparte-config.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteContextSummary, AparteMessage } from '../../types/index.js';

const summary: AparteContextSummary = { summary: 'The user is planning a trip.', count: 2, createdAt: 10 };

const turn = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${role} ${id}`, timestamp: 1, ...(role === 'assistant' ? { status: 'completed' as const } : {}), ...extra,
});
const transcript = (): AparteMessage[] => [
    turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user'), turn('a2', 'assistant'), turn('u3', 'user'), turn('a3', 'assistant'),
];

async function setup() {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config: new AparteConfig() });
    const teardown = host.bind();
    for (const m of transcript()) host.appendMessage(m);

    /** The framework's part: one bubble per message, drawn from the list. */
    const draw = (ids: string[] = messages.map((m) => m.id)): void => {
        for (const id of ids) {
            if (viewport.querySelector(`aparte-chat-bubble[message-id="${id}"]`)) continue;
            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', id);
            bubble.setAttribute('data-role', messages.find((m) => m.id === id)!.role);
            viewport.appendChild(bubble);
        }
    };
    const bubbleOf = (id: string): HTMLElement => viewport.querySelector<HTMLElement>(`aparte-chat-bubble[message-id="${id}"]`)!;
    const separatorOf = (id: string): HTMLElement | null => bubbleOf(id).querySelector<HTMLElement>(':scope > .aparte-checkpoint');
    return { host, root, viewport, teardown, draw, bubbleOf, separatorOf, list: () => messages, setList: (m: AparteMessage[]) => { messages = m; } };
}

const emit = (name: string, detail: object): void => { window.dispatchEvent(new CustomEvent(name, { detail })); };

describe('a checkpoint on a transcript the framework owns reaches its bubble', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('through updateMessage on a message that is not the last, with no render in between', async () => {
        const { host, draw, separatorOf, teardown } = await setup();
        draw();
        host.syncBubbles();
        expect(separatorOf('u2')).toBeNull();

        host.updateMessage('u2', { contextSummary: summary });

        expect(separatorOf('u2')!.textContent, 'drawn at once').toContain('2 messages summarised for the model');
        expect(separatorOf('u3')).toBeNull();
        teardown();
    });

    it('and takes it off again when the checkpoint is cleared', async () => {
        const { host, draw, separatorOf, teardown } = await setup();
        draw();
        host.updateMessage('u2', { contextSummary: summary });
        expect(separatorOf('u2')).not.toBeNull();

        host.updateMessage('u2', { contextSummary: undefined });
        expect(separatorOf('u2')).toBeNull();
        teardown();
    });

    it('on the next sync when its bubble was not on the page yet', async () => {
        const { host, draw, separatorOf, teardown } = await setup();
        host.updateMessage('u2', { contextSummary: summary });   // no bubbles exist
        draw();
        host.syncBubbles();
        expect(separatorOf('u2')).not.toBeNull();
        teardown();
    });

    it('on the next sync even when the message had been synced before (it is not skipped as rendered)', async () => {
        const { host, draw, bubbleOf, separatorOf, teardown } = await setup();
        draw();
        host.syncBubbles();                                  // u2 is now in the rendered set
        // A framework that replaces the bubble element (a keyed re-render) loses the imperative state.
        bubbleOf('u2').replaceWith(bubbleOf('u2').cloneNode(false));
        host.updateMessage('u2', { contextSummary: summary });
        host.syncBubbles();
        expect(separatorOf('u2')).not.toBeNull();
        teardown();
    });

    it('through the list the framework owns: a new object for a message that is not the last', async () => {
        const { host, draw, list, setList, separatorOf, teardown } = await setup();
        draw();
        host.syncBubbles();                                  // every message is rendered once
        expect(separatorOf('u2')).toBeNull();

        // What a controlled `messages` prop, a v-model or a store-backed compaction target does:
        // it never goes through `updateMessage`, it hands the host a list with a fresh object.
        setList(list().map((m) => (m.id === 'u2' ? { ...m, contextSummary: summary } : m)));
        host.syncBubbles();

        expect(separatorOf('u2')!.textContent).toContain('2 messages summarised for the model');
        expect(separatorOf('u3')).toBeNull();

        // And the list taking it off again, the same way.
        setList(list().map((m) => (m.id === 'u2' ? { ...m, contextSummary: undefined } : m)));
        host.syncBubbles();
        expect(separatorOf('u2')).toBeNull();
        teardown();
    });

    it('does not draw a message again while the list still holds the same object', async () => {
        const { host, draw, bubbleOf, teardown } = await setup();
        draw();
        host.syncBubbles();
        const content = bubbleOf('u2').querySelector('.aparte-message__content')?.firstChild ?? null;
        host.syncBubbles();
        expect(bubbleOf('u2').querySelector('.aparte-message__content')?.firstChild ?? null).toBe(content);
        teardown();
    });

    it('for a legacy summary message too', async () => {
        const { host, draw, separatorOf, bubbleOf, teardown } = await setup();
        draw();
        host.updateMessage('u1', { compaction: true });
        expect(separatorOf('u1')!.getAttribute('data-state')).toBe('legacy');
        expect(bubbleOf('u1').querySelector('.aparte-message')!.hasAttribute('data-superseded')).toBe(true);
        teardown();
    });
});

describe('the compaction events, under a framework', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('mark the bubble pending, then failed with a reason, and the matching done clears it', async () => {
        const { draw, bubbleOf, separatorOf, teardown } = await setup();
        draw();

        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });
        expect(bubbleOf('u2').getAttribute('data-checkpoint')).toBe('pending');
        expect(separatorOf('u2')!.getAttribute('data-state')).toBe('pending');

        emit('aparte-compact-error', { error: 'Too slow', messageId: 'u2', targetId: 'h1' });
        expect(bubbleOf('u2').getAttribute('data-checkpoint')).toBe('failed');
        expect(bubbleOf('u2').getAttribute('data-checkpoint-reason')).toBe('Too slow');

        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });
        emit('aparte-compact-done', { messageId: 'u2', targetId: 'h1', count: 2 });
        expect(bubbleOf('u2').hasAttribute('data-checkpoint')).toBe(false);
        teardown();
    });

    it('say the second reason when a second failure comes with no start in between', async () => {
        const { draw, separatorOf, teardown } = await setup();
        draw();
        const title = (): string => separatorOf('u2')!.querySelector<HTMLElement>('.aparte-checkpoint__text')!.title;

        emit('aparte-compact-error', { error: 'First', messageId: 'u2', targetId: 'h1' });
        expect(title()).toBe('First');
        emit('aparte-compact-error', { error: 'Second', messageId: 'u2', targetId: 'h1' });
        expect(title()).toBe('Second');
        teardown();
    });

    it('ignore a skipped done, another message, and another chat', async () => {
        const { draw, bubbleOf, teardown } = await setup();
        draw();
        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });

        emit('aparte-compact-done', { skipped: true, reason: 'running', messageId: 'u2', targetId: 'h1' });
        emit('aparte-compact-done', { messageId: 'u3', targetId: 'h1' });
        emit('aparte-compact-done', { messageId: 'u2', targetId: 'elsewhere' });
        emit('aparte-compact-start', { messageId: 'u3', targetId: 'elsewhere' });
        expect(bubbleOf('u2').getAttribute('data-checkpoint')).toBe('pending');
        expect(bubbleOf('u3').hasAttribute('data-checkpoint')).toBe(false);
        teardown();
    });

    it('are said again on a bubble the framework draws after the start', async () => {
        const { host, draw, bubbleOf, teardown } = await setup();
        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });   // no bubbles yet
        draw();
        host.syncBubbles();
        expect(bubbleOf('u2').getAttribute('data-checkpoint')).toBe('pending');
        teardown();
    });

    it('are cleared by a conversation switch', async () => {
        const { host, draw, bubbleOf, teardown } = await setup();
        draw();
        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });
        const bubble = bubbleOf('u2');

        host.conversationController!.unbind();           // keep the controller out of it
        (host as unknown as { _beginConversationSwap(): void })._beginConversationSwap();
        expect(bubble.hasAttribute('data-checkpoint')).toBe(false);
        teardown();
    });

    it('are not answered by the viewport as well: one writer', async () => {
        const { viewport, draw, bubbleOf, teardown } = await setup();
        draw();
        const writes: string[] = [];
        new MutationObserver((records) => {
            for (const r of records) if (r.attributeName === 'data-checkpoint') writes.push(r.attributeName);
        }).observe(viewport, { attributes: true, subtree: true });
        emit('aparte-compact-start', { messageId: 'u2', targetId: 'h1' });
        await Promise.resolve();
        expect(bubbleOf('u2').getAttribute('data-checkpoint')).toBe('pending');
        expect(writes, 'written once').toHaveLength(1);
        teardown();
    });
});

describe('Restore, under a framework', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('takes every checkpoint off the framework list, the bubbles and the tree, and says it was restored', async () => {
        const { host, draw, list, bubbleOf, separatorOf, viewport, teardown } = await setup();
        draw();
        host.updateMessage('u1', { contextSummary: { ...summary, count: 1 } });
        host.updateMessage('u2', { contextSummary: summary });
        expect(viewport.querySelectorAll('.aparte-checkpoint')).toHaveLength(2);
        const done = vi.fn();
        window.addEventListener('aparte-compact-done', done);

        bubbleOf('u2').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore"]')!.click();
        bubbleOf('u2').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore-confirm"]')!.click();

        expect(list().filter((m) => m.contextSummary), 'the framework\'s list').toHaveLength(0);
        expect(separatorOf('u1')).toBeNull();
        expect(separatorOf('u2')).toBeNull();
        host.syncRepoFromMessages();
        expect((viewport as unknown as { getMessage(id: string): AparteMessage }).getMessage('u1').contextSummary, 'and the tree, once synced').toBeUndefined();
        expect(done).toHaveBeenCalledTimes(1);
        expect((done.mock.calls[0]![0] as CustomEvent).detail).toEqual({ restored: true, messageId: 'u2', targetId: 'h1' });
        window.removeEventListener('aparte-compact-done', done);
        teardown();
    });
});
