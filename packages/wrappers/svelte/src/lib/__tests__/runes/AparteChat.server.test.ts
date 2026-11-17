import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { aparteGlobalConfig } from '@aparte/core';
import AparteChat from '../../runes/AparteChat.svelte';
import LegacyAparteChat from '../../AparteChat.svelte';
import SnippetsHost from './SnippetsHost.svelte';
import HelloHost from './HelloHost.svelte';
import KeyedClientHost from './KeyedClientHost.svelte';

describe('<AparteChat> for Svelte 5, on the server', () => {
    it('renders the chat shell with a stable id and no browser API', () => {
        const { body } = render(AparteChat, { props: {} });
        expect(body).toContain('data-aparte-chat');
        // The elements wait for hydration: the browser upgrades them only once Svelte has the page.
        expect(body).toContain('defer-hydration');
        expect(body).toMatch(/id="aparte-chat-[^"]+"/);
        expect(body).toContain('<aparte-composer');
    });

    it('renders a page that starts a client — createAparteClient touches nothing of the browser there', () => {
        // Svelte runs onDestroy on the server, at the end of the render: stopping the client
        // there read `window` and failed every SvelteKit page that followed the docs.
        const { body } = render(HelloHost, { props: {} });
        expect(body).toContain('data-aparte-chat');
    });

    it('a server render leaves no key source behind on the config every request shares', async () => {
        // The client puts its keyResolver on the config when it is constructed; a server never
        // mounts, so only the destroy at the end of the render can take it off again. (`.body`
        // is read: the render runs when its output is.)
        const asked: string[] = [];
        const resolve = (id: string) => { asked.push(id); return 'request-secret'; };
        expect(render(KeyedClientHost, { props: { resolve } }).body).toContain('data-aparte-chat');
        expect(render(KeyedClientHost, { props: { resolve } }).body).toContain('data-aparte-chat');
        expect(await aparteGlobalConfig.getKey('openai')).not.toBe('request-secret');
        expect(asked).toEqual([]);
    });

    it('renders the snippets on the server', () => {
        const { body } = render(SnippetsHost, { props: {} });
        expect(body).toContain('Ask me anything');
        expect(body).toContain('Shift + Enter');
    });

    it('draws who wrote a message, and a notice, in the HTML it sends (Svelte 5 and Svelte 4)', () => {
        const messages = [{ id: 'h1', role: 'assistant' as const, author: { name: 'Marie', type: 'human' as const }, content: 'Marie here.', timestamp: 0 }, { id: 'n1', role: 'assistant' as const, kind: 'notice' as const, content: 'Marie joined the conversation', timestamp: 0 }];
        for (const body of [render(AparteChat, { props: { messages } }).body, render(LegacyAparteChat, { props: { messages } }).body]) {
            expect(body).toMatch(/<aparte-chat-bubble[^>]*name="Marie"/);
            expect(body).toMatch(/<aparte-chat-bubble[^>]*data-author-type="human"/);
            expect(body).toMatch(/<aparte-chat-bubble[^>]*data-kind="notice"/);
        }
    });
});
