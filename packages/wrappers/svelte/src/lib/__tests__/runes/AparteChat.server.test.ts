import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import AparteChat from '../../runes/AparteChat.svelte';
import SnippetsHost from './SnippetsHost.svelte';

describe('<AparteChat> for Svelte 5, on the server', () => {
    it('renders the chat shell with a stable id and no browser API', () => {
        const { body } = render(AparteChat, { props: {} });
        expect(body).toContain('data-aparte-chat');
        expect(body).toMatch(/id="aparte-chat-[^"]+"/);
        expect(body).toContain('<aparte-composer');
    });

    it('renders the snippets on the server', () => {
        const { body } = render(SnippetsHost, { props: {} });
        expect(body).toContain('Ask me anything');
        expect(body).toContain('Shift + Enter');
    });
});
