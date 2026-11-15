import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { registerAllComponents } from '@aparte/core';
import GenericPathHost from './GenericPathHost.svelte';

/*
 * The Svelte 5 generic path: what the chat does not declare is set on its root element, so
 * `onaparte-some-event={…}` — Svelte 5's event attribute — hears an event core has no callback
 * for, a plugin's. The event here is plugin-shaped: it bubbles from inside the chat.
 */

registerAllComponents();
afterEach(() => cleanup());

const MESSAGES = [{ id: 'm1', role: 'assistant' as const, content: 'hi', timestamp: 1 }];

interface Host { api(): import('@aparte/core').AparteChatImperativeApi | undefined; events(): CustomEvent[] }

describe('<AparteChat> (Svelte 5) and an event core does not know', () => {
    it('hears a plugin-shaped event sent from inside the chat, once, with its detail', async () => {
        const { container, component } = render(GenericPathHost, { messages: MESSAGES });
        await tick();
        container.querySelector('aparte-chat-bubble')!
            .dispatchEvent(new CustomEvent('aparte-test-plugin-event', { bubbles: true, detail: { x: 1 } }));
        await tick();
        const heard = (component as unknown as Host).events();
        expect(heard).toHaveLength(1);
        expect(heard[0].detail).toEqual({ x: 1 });
    });

    it('returns the root from getElement() and the composer from getComposer()', async () => {
        const { container, component } = render(GenericPathHost, { messages: MESSAGES });
        await tick();
        const chat = (component as unknown as Host).api()!;
        const root = container.querySelector('[data-aparte-chat]');
        expect(root).not.toBeNull();
        expect(chat.getElement()).toBe(root);
        expect(chat.getComposer()).toBe(root!.querySelector('aparte-composer'));
    });
});
