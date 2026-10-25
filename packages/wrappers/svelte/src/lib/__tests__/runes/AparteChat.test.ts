import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import AparteChat from '../../runes/AparteChat.svelte';
import BindHost from './BindHost.svelte';
import SnippetsHost from './SnippetsHost.svelte';
import type { AparteMessage } from '../../types.js';

/**
 * The Svelte 5 chat, driven the way a Svelte 5 app drives it: no `$set`, no `on:` —
 * props, `bind:`, snippets and callback props. This file is compiled WITHOUT the
 * Svelte 4 component API (see vitest.config.ts), so nothing here can lean on it.
 */
const two: AparteMessage[] = [
    { id: '1', role: 'user', content: 'Hello', timestamp: 1 },
    { id: '2', role: 'assistant', content: 'Hi there!', timestamp: 2 },
];

function send(container: HTMLElement, content: string) {
    container.querySelector('aparte-composer')!.dispatchEvent(
        new CustomEvent('aparte-send', { detail: { content, timestamp: 3 }, bubbles: true, composed: true }),
    );
}

afterEach(() => cleanup());

describe('<AparteChat> for Svelte 5', () => {
    it('renders a working chat with no props', () => {
        const { container } = render(AparteChat);
        expect(container.querySelector('[data-aparte-chat]')).not.toBeNull();
        expect(container.querySelector('aparte-chat-viewport')).not.toBeNull();
        expect(container.querySelector('aparte-composer aparte-composer-input')).not.toBeNull();
        expect(container.querySelector('[data-aparte-chat]')!.id).toMatch(/^aparte-chat-/);
    });

    it('bind:messages carries a change the chat makes back to the parent', async () => {
        const { component } = render(BindHost, { props: { initial: [{ id: '1', role: 'assistant', content: 'Hel', timestamp: 1 }] } });
        await tick();
        const host = component as unknown as { current(): AparteMessage[]; api(): { updateMessage(id: string, u: Partial<AparteMessage>): void } };
        host.api().updateMessage('1', { content: 'Hello world' });
        flushSync();
        expect(host.current()[0]?.content).toBe('Hello world');
    });

    it('a parent write to messages is drawn', async () => {
        const { container, component } = render(BindHost);
        (component as unknown as { write(m: AparteMessage[]): void }).write(two);
        flushSync();
        await tick();
        const bubbles = container.querySelectorAll('aparte-chat-bubble');
        expect(bubbles).toHaveLength(2);
        expect(bubbles[1]!.getAttribute('message-id')).toBe('2');
    });

    // The chat's own emit comes back through the prop — wrapped in a proxy by Svelte, in a bare
    // chat as under `bind:` on a $state — and must not be taken for a parent write: applying it
    // rolled back what a non-emitting call (appendMessage) had added in the same tick.
    for (const [label, Host] of [['a bare chat', AparteChat], ['bind:messages on a $state', BindHost]] as const) {
        it(`an emit followed by an append in one tick keeps the append (${label})`, async () => {
            const { component, container } = render(Host as typeof BindHost);
            const chat = (Host === AparteChat ? component : (component as unknown as { api(): unknown }).api()) as {
                appendMessage(m: AparteMessage): void;
                truncateResponsesAfter(id: string): void;
                updateLastMessage(content: string, opts?: { append?: boolean }): void;
                getMessages(): AparteMessage[];
            };
            chat.appendMessage({ id: 'u1', role: 'user', content: 'q', timestamp: 1 });
            flushSync();
            await tick();
            chat.truncateResponsesAfter('u1');
            chat.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 2 });
            flushSync();
            await tick();
            expect(chat.getMessages().map((m) => m.id)).toEqual(['u1', 'a1']);
            expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(2);
            chat.updateLastMessage('Hi', { append: true });
            flushSync();
            expect(chat.getMessages().map((m) => m.content)).toEqual(['q', 'Hi']);
        });
    }

    it('a push on the bound $state array is drawn, and survives the next emit', async () => {
        const { container, component } = render(BindHost, { props: { initial: [...two] } });
        await tick();
        const host = component as unknown as { push(m: AparteMessage): void; current(): AparteMessage[]; api(): { updateMessage(id: string, u: Partial<AparteMessage>): void; getMessages(): AparteMessage[] } };
        host.push({ id: 'p1', role: 'assistant', content: 'pushed', timestamp: 3 });
        flushSync();
        await tick();
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(3);
        expect(host.api().getMessages().map((m) => m.id)).toEqual(['1', '2', 'p1']);
        // The chat's next emit carries the pushed message, so the parent keeps it.
        host.api().updateMessage('1', { content: 'Hello again' });
        flushSync();
        expect(host.current().map((m) => m.id)).toEqual(['1', '2', 'p1']);
    });

    it('emptyState, aboveComposer, toolbar and bubble snippets render where the slots did', async () => {
        const empty = render(SnippetsHost);
        expect(empty.container.querySelector('aparte-chat-viewport .welcome')?.textContent).toBe('Ask me anything');
        expect(empty.container.querySelector('.banner')).not.toBeNull();
        expect(empty.container.querySelector('aparte-composer-toolbar .hint')).not.toBeNull();
        cleanup();

        const full = render(SnippetsHost, { props: { messages: two } });
        await tick();
        expect(full.container.querySelector('.welcome')).toBeNull();
        expect(full.container.querySelectorAll('aparte-chat-bubble')).toHaveLength(0);
        expect([...full.container.querySelectorAll('.my-bubble')].map((b) => b.textContent)).toEqual(['Hello', 'Hi there!']);
    });

    it('callbacks fire with the payload', () => {
        const onSent = vi.fn();
        const { container } = render(BindHost, { props: { onSent } });
        send(container, 'payload');
        expect(onSent).toHaveBeenCalledWith('payload');
    });

    it('exposes the imperative API on bind:this', async () => {
        const { component } = render(BindHost);
        await tick();
        const api = (component as unknown as { api(): { appendMessage(m: AparteMessage): void; getMessages(): AparteMessage[] } }).api();
        api.appendMessage({ id: 'a1', role: 'assistant', content: 'appended', timestamp: 4 });
        expect(api.getMessages().map((m) => m.id)).toContain('a1');
    });
});
