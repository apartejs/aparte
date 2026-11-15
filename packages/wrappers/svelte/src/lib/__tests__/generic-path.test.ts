import { describe, it, expect, afterEach, expectTypeOf } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { registerAllComponents, type AparteChatImperativeApi } from '@aparte/core';
import GenericPathHost from './GenericPathHost.svelte';
import { createAparteChat, type AparteChatStore } from '../stores/aparteChat';

/*
 * The Svelte 4 generic path: `getElement()` is the chat's root, where every event of the chat
 * arrives — `bind:this` the chat, then `addEventListener` on it in `onMount`. The event is
 * plugin-shaped: it bubbles from inside the chat and core has no `on:` for it.
 */

registerAllComponents();
afterEach(() => cleanup());

const MESSAGES = [{ id: 'm1', role: 'assistant' as const, content: 'hi', timestamp: 1 }];

describe('<AparteChat> (Svelte 4) and an event core does not know', () => {
    it('hears a plugin-shaped event sent from inside the chat, once, with its detail', async () => {
        const { container, component } = render(GenericPathHost, { messages: MESSAGES });
        await tick();
        container.querySelector('aparte-chat-bubble')!
            .dispatchEvent(new CustomEvent('aparte-test-plugin-event', { bubbles: true, detail: { x: 1 } }));
        await tick();
        const heard = (component as unknown as { events(): CustomEvent[] }).events();
        expect(heard).toHaveLength(1);
        expect(heard[0].detail).toEqual({ x: 1 });
    });

    it('returns the root from getElement() and the composer from getComposer()', async () => {
        const { container, component } = render(GenericPathHost, { messages: MESSAGES });
        await tick();
        const chat = (component as unknown as { instance(): AparteChatImperativeApi }).instance();
        const root = container.querySelector('[data-aparte-chat]');
        expect(root).not.toBeNull();
        expect(chat.getElement()).toBe(root);
        expect(chat.getComposer()).toBe(root!.querySelector('aparte-composer'));
    });
});

describe('createAparteChat', () => {
    it('is the imperative API, and more', () => {
        expectTypeOf<AparteChatStore>().toMatchTypeOf<AparteChatImperativeApi>();
        const chat = createAparteChat();
        expect(chat.getElement()).toBeNull();
        expect(chat.getComposer()).toBeNull();
    });
});
