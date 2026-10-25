import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import AparteChat from '../AparteChat.vue';

describe('<AparteChat> (Vue) on the server', () => {
    it('renders AparteChat to a string, with no browser API at hand', async () => {
        const app = createSSRApp({
            render: () => h(AparteChat, { centerWhenEmpty: true }, { 'empty-state': () => h('p', 'Ask me anything…') }),
        });
        const html = await renderToString(app);
        expect(html).toContain('data-aparte-chat');
        // The elements wait for hydration: the browser upgrades them only once Vue has the page.
        expect(html).toContain('defer-hydration');
        expect(html).toContain('<aparte-composer');
        expect(html).toContain('Ask me anything…');
    });

    it('renders the messages it is given', async () => {
        const app = createSSRApp({
            render: () => h(AparteChat, { messages: [{ id: 'm1', role: 'assistant', content: 'Rendered on the server', timestamp: 0 }] }),
        });
        const html = await renderToString(app);
        expect(html).toContain('<aparte-chat-bubble');
    });
});
