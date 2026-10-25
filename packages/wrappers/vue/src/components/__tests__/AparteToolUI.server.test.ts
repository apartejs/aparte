import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { aparteGlobalConfig } from '@aparte/core';
import AparteToolUI from '../AparteToolUI.vue';
import AparteSegmentUI from '../AparteSegmentUI.vue';

describe('<AparteToolUI> (Vue) on the server', () => {
    it('renders nothing on the server, and declares nothing there', async () => {
        const before = aparteGlobalConfig.getToolRenderer('get_weather');
        const app = createSSRApp({
            render: () => h('div', { id: 'page' }, [
                h(AparteToolUI, { name: 'get_weather' }, { default: () => h('span', { class: 'card' }) }),
                h(AparteSegmentUI, { type: 'chart' }, { default: () => h('span', { class: 'chart' }) }),
            ]),
        });
        const html = await renderToString(app);
        expect(html).not.toContain('card');
        expect(html).not.toContain('chart');
        // A registration on the server would be shared by every request the process serves.
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(before);
    });
});
