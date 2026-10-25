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
