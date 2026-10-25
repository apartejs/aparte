import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h, inject, onMounted, onUnmounted, provide, ref, toRaw, type PropType, type Ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { AparteConfig, aparteGlobalConfig, getSegmentRenderer, registerAllComponents, registerDefaultRenderers, type AparteSegmentBase, type AparteToolCallSegment, type AparteToolCallView } from '@aparte/core';
import AparteToolUI from '../AparteToolUI.vue';
import AparteSegmentUI from '../AparteSegmentUI.vue';
import { isAparteElement } from '../../is-aparte-element';

registerAllComponents();

type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    updateSegment: (id: string, u: unknown) => void;
};

const call = (id: string, name: string, city = 'Paris'): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name, input: { city } },
} as AparteToolCallSegment);

function bubble(...segments: unknown[]): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    for (const s of segments) b.addSegment(s);
    return b;
}

/** Core's registry redraws in a microtask; Vue renders on its next tick. */
const settle = async () => { await flushPromises(); await flushPromises(); };

const weather = ({ tool }: { tool: AparteToolCallView }) =>
    h('span', { class: 'weather' }, `${(tool.input as { city: string }).city}:${tool.status}`);

const declare = (slot: (p: { tool: AparteToolCallView }) => unknown) =>
    mount(AparteToolUI, { props: { name: 'get_weather' }, slots: { default: slot as never } });

describe('<AparteToolUI> (Vue)', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('renders the content into each matching tool call', async () => {
        const w = declare(weather);
        await settle();
        const b = bubble(call('s1', 'get_weather', 'Paris'), call('s2', 'search'), call('s3', 'get_weather', 'Lille'));
        await settle();
        expect(Array.from(b.querySelectorAll('.aparte-tool-ui .weather'), (el) => el.textContent)).toEqual(['Paris:pending', 'Lille:pending']);
        expect(b.querySelector('[data-tool-name="search"]')).not.toBeNull();
        w.unmount();
    });

    it('two calls with the same id in two messages each get their own card', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const w = declare(weather);
        await settle();
        const first = bubble(call('s1', 'get_weather', 'Paris'));
        const second = bubble(call('s1', 'get_weather', 'Lille'));
        await settle();
        expect(first.querySelector('.weather')?.textContent).toBe('Paris:pending');
        expect(second.querySelector('.weather')?.textContent).toBe('Lille:pending');
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
        w.unmount();
    });

    it('keeps the context of where it is declared', async () => {
        const Card = defineComponent({ setup: () => () => h('span', { class: 'themed' }, inject('theme', 'none')) });
        const Page = defineComponent({
            setup() {
                provide('theme', 'brass');
                return () => h(AparteToolUI, { name: 'get_weather' }, { default: () => h(Card) });
            },
        });
        const w = mount(Page);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.aparte-tool-ui .themed')?.textContent).toBe('brass');
        w.unmount();
    });

    it('a result update re-renders the same instance', async () => {
        let mounts = 0;
        const Card = defineComponent({
            props: { status: { type: String as PropType<string>, required: true } },
            setup(props) { const id = ++mounts; return () => h('span', { class: 'card', 'data-instance': id }, props.status); },
        });
        const w = declare(({ tool }) => h(Card, { status: tool.status }));
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        const first = b.querySelector('.card');
        b.updateSegment('s1', { status: 'resolved', result: '18°C' });
        await settle();
        expect(b.querySelector('.card')).toBe(first);
        expect(first?.textContent).toBe('resolved');
        expect(mounts).toBe(1);
        w.unmount();
    });

    it('takes over a card already on screen when it mounts late', async () => {
        const b = bubble(call('s1', 'get_weather'));
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        const w = declare(weather);
        await settle();
        expect(b.querySelector('.aparte-tool-ui .weather')?.textContent).toBe('Paris:pending');
        w.unmount();
    });

    it('unmounting it restores the default row on the card already on screen', async () => {
        let unmounted = 0;
        const Card = defineComponent({ setup() { onUnmounted(() => { unmounted++; }); return () => h('span', { class: 'card' }); } });
        const w = declare(() => h(Card));
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.card')).not.toBeNull();
        w.unmount();
        await settle();
        expect(b.querySelector('.aparte-tool-ui')).toBeNull();
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        expect(unmounted).toBe(1);
    });

    it('two declarations for one tool: removing the lower one keeps the upper one', async () => {
        const lower = ref(true);
        const Page = defineComponent({
            setup: () => () => [
                lower.value ? h(AparteToolUI, { name: 'get_weather' }, { default: () => h('span', { class: 'lower' }) }) : null,
                h(AparteToolUI, { name: 'get_weather' }, { default: () => h('span', { class: 'upper' }) }),
            ],
        });
        const w = mount(Page);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.upper')).not.toBeNull();
        lower.value = false;
        await settle();
        expect(b.querySelector('.upper')).not.toBeNull();
        expect(b.querySelector('.lower')).toBeNull();
        w.unmount();
    });
});

interface ChartSegment extends AparteSegmentBase {
    type: 'chart';
    points: number[];
}

describe('<AparteSegmentUI> (Vue)', () => {
    afterEach(() => { document.body.replaceChildren(); });

    it('draws a segment type of your own, and follows its updates', async () => {
        const w = mount(AparteSegmentUI, {
            props: { type: 'chart' },
            slots: { default: (({ segment }: { segment: ChartSegment }) => h('span', { class: 'chart' }, segment.points.join(','))) as never },
        });
        await settle();
        const b = bubble({ id: 'c1', type: 'chart', points: [1, 2] });
        await settle();
        expect(b.querySelector('.aparte-segment-ui .chart')?.textContent).toBe('1,2');
        b.updateSegment('c1', { points: [1, 2, 3] });
        await settle();
        expect(b.querySelector('.chart')?.textContent).toBe('1,2,3');
        w.unmount();
    });
});

describe('<AparteToolUI> / <AparteSegmentUI> (Vue) with what Vue hands them', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer(/^get_weather$/);
        document.body.replaceChildren();
    });

    it('a config held in a ref is declared on as the instance, not as Vue\'s proxy of it', async () => {
        // What a deep ref holds is Vue's reactive proxy of the instance — the value this test is
        // about. Its unwrapped TYPE drops the private members, so it is named for what it is.
        const held = ref(new AparteConfig()) as unknown as Ref<AparteConfig>;
        const w = mount(AparteSegmentUI, {
            props: { type: 'chart', config: held.value },
            slots: { default: () => h('span') },
        });
        await settle();
        // The chat's bubbles read the instance: a registry keyed by the proxy is one nobody reads.
        expect(getSegmentRenderer('chart', toRaw(held.value))).toBeDefined();
        w.unmount();
    });

    it('a RegExp built anew on every render is the same declaration: the card is not remounted', async () => {
        let mounts = 0;
        const Card = defineComponent({ setup() { onMounted(() => { mounts++; }); return () => h('span', { class: 'card' }); } });
        const renders = ref(0);
        const Page = defineComponent({
            setup: () => () => {
                void renders.value;
                return h(AparteToolUI, { name: /^get_weather$/ }, { default: () => h(Card) });
            },
        });
        const w = mount(Page);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(mounts).toBe(1);
        const card = b.querySelector('.card');
        renders.value++;
        await settle();
        renders.value++;
        await settle();
        expect(mounts).toBe(1);
        expect(b.querySelector('.card')).toBe(card);
        w.unmount();
    });
});

describe('isAparteElement', () => {
    it('accepts aparte-* tags only, and leaves the wrapper\'s own components to Vue', () => {
        expect(isAparteElement('aparte-icon')).toBe(true);
        expect(isAparteElement('aparte-chat')).toBe(true);
        expect(isAparteElement('aparte-approval-mode')).toBe(true);
        expect(isAparteElement('my-card')).toBe(false);
        expect(isAparteElement('AparteToolUI')).toBe(false);
        expect(isAparteElement('aparte-tool-ui')).toBe(false);
        expect(isAparteElement('aparte-tool-u-i')).toBe(false);
        expect(isAparteElement('aparte-segment-ui')).toBe(false);
        expect(isAparteElement('aparte-ui')).toBe(false);
    });
});
