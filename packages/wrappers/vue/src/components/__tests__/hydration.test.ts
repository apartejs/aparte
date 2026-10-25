/**
 * A server-rendered <AparteChat> hydrates: the HTML a server sent is put in a page where core's
 * elements are defined — so they upgrade on insertion, as in a browser — then Vue hydrates it.
 * Without `defer-hydration` the elements draw themselves on insertion and Vue reports the DOM it
 * finds as a hydration mismatch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, createSSRApp, defineComponent, h, onMounted, ref } from 'vue';
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

    // A slot's component runs its onMounted BEFORE the chat's own: the elements it renders must
    // be live by then — not held until the chat mounts — whether the page was hydrated or not.
    const probe = (seen: { drawn: boolean | null }) => defineComponent({
        setup() {
            const el = ref<HTMLElement>();
            onMounted(() => { seen.drawn = !!el.value?.querySelector('button'); });
            return () => h('aparte-composer-send', { ref: el });
        },
    });

    it('a client-only page holds nothing: a slot component sees live elements in its onMounted', () => {
        const seen = { drawn: null as boolean | null };
        const container = document.createElement('div');
        document.body.append(container);
        const app = createApp({ render: () => h(AparteChat, null, { composer: () => h(probe(seen)) }) });
        app.mount(container);
        expect(seen.drawn).toBe(true);
        app.unmount();
    });

    it("a hydrated page is released before a slot component's onMounted", async () => {
        const seen = { drawn: null as boolean | null };
        const ssr = () => createSSRApp({ render: () => h(AparteChat, null, { composer: () => h(probe(seen)) }) });
        const container = document.createElement('div');
        container.innerHTML = await renderToString(ssr());
        document.body.append(container);
        const app = ssr();
        app.mount(container);
        expect(seen.drawn).toBe(true);
        app.unmount();
    });
});
