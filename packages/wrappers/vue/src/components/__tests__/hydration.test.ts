/**
 * A server-rendered <AparteChat> hydrates: the HTML a server sent is put in a page where core's
 * elements are defined — so they upgrade on insertion, as in a browser — then Vue hydrates it.
 * Without `defer-hydration` the elements draw themselves on insertion and Vue reports the DOM it
 * finds as a hydration mismatch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { registerAllComponents } from '@aparte/core';
import AparteChat from '../AparteChat.vue';

registerAllComponents();

afterEach(() => { document.body.replaceChildren(); });

const page = () => createSSRApp({ render: () => h(AparteChat, { centerWhenEmpty: true }, { 'empty-state': () => h('p', 'Ask me anything…') }) });

describe('<AparteChat> (Vue) hydrating server HTML', () => {
    it('hydrates with no mismatch, then the elements draw themselves', async () => {
        const html = await renderToString(page());
        expect(html).toContain('defer-hydration');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.append(container);
        expect(container.querySelector('aparte-composer-send')!.innerHTML).toBe('');

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = page();
        app.mount(container);
        const reported = [...warn.mock.calls, ...error.mock.calls].map((c) => String(c[0])).filter((m) => /hydrat|mismatch/i.test(m));
        warn.mockRestore();
        error.mockRestore();

        expect(reported).toEqual([]);
        expect(container.querySelector('[data-aparte-chat]')!.hasAttribute('defer-hydration')).toBe(false);
        expect(container.querySelector('aparte-composer-send button')).not.toBeNull();
        expect(container.textContent).toContain('Ask me anything…');
        app.unmount();
    });
});
