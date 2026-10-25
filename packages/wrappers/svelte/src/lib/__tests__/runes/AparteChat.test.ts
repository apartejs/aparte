import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import AparteChat from '../../runes/AparteChat.svelte';
import BindHost from './BindHost.svelte';
import SnippetsHost from './SnippetsHost.svelte';
import SnippetProbeHost from './SnippetProbeHost.svelte';
import ControlledHost from './ControlledHost.svelte';
import BindCallbackHost from './BindCallbackHost.svelte';
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

describe('<AparteChat> for Svelte 5 and defer-hydration', () => {
    afterEach(() => cleanup());

    it("a snippet's component sees live elements in its own onMount, which runs before the chat's", () => {
        const seen = { drawn: null as boolean | null };
        render(SnippetProbeHost, { seen });
        expect(seen.drawn).toBe(true);
    });
});

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
    // The parent's write-back makes a proxy of its own (Svelte keeps no proxy cache), so the
    // value that comes back is neither the list nor the chat's proxy of it.
    for (const [label, Host] of [
        ['a bare chat', AparteChat],
        ['bind:messages on a $state', BindHost],
        ['messages={msgs} written back into a deep $state', ControlledHost],
        ['bind:messages and a callback that assigns too', BindCallbackHost],
    ] as const) {
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

    type BindApi = {
        push(m: AparteMessage): void; pop(): void; empty(): void; current(): AparteMessage[];
        api(): { updateMessage(id: string, u: Partial<AparteMessage>): void; getMessages(): AparteMessage[]; truncateFrom(id: string): void };
    };

    it('a message the parent pushes and then removes goes, even when the removal brings back the ids of the last emit', async () => {
        const { container, component } = render(BindHost, { props: { initial: [...two] } });
        await tick();
        const host = component as unknown as BindApi;
        host.api().updateMessage('1', { content: 'Hello again' });
        flushSync();
        await tick();
        host.push({ id: 'p1', role: 'assistant', content: 'a notice', timestamp: 3 });
        flushSync();
        await tick();
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(3);
        host.pop();
        flushSync();
        await tick();
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(2);
        expect(host.api().getMessages().map((m) => m.id)).toEqual(['1', '2']);
        // And the chat's next emit does not write it back into the parent's state.
        host.api().updateMessage('2', { content: 'Hi again' });
        flushSync();
        expect(host.current().map((m) => m.id)).toEqual(['1', '2']);
    });

    it('after the chat emptied the list, a push then a clear by the parent is drawn', async () => {
        const { container, component } = render(BindHost, { props: { initial: [...two] } });
        await tick();
        const host = component as unknown as BindApi;
        host.api().truncateFrom('1');
        flushSync();
        await tick();
        host.push({ id: 'p1', role: 'assistant', content: 'a notice', timestamp: 3 });
        flushSync();
        await tick();
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(1);
        host.empty();
        flushSync();
        await tick();
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(0);
        expect(host.api().getMessages()).toEqual([]);
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
