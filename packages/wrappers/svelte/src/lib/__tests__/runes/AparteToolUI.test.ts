import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { aparteGlobalConfig, registerAllComponents, registerDefaultRenderers, type AparteToolCallSegment } from '@aparte/core';
import ToolUIHost from './ToolUIHost.svelte';
import SegmentUIHost from './SegmentUIHost.svelte';
import { counters, resetCounters } from './tool-ui-counters.js';

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

/** Core's registry redraws in a microtask; Svelte flushes its effects after. */
const settle = async () => { await tick(); await Promise.resolve(); flushSync(); };

describe('<AparteToolUI> for Svelte 5', () => {
    beforeEach(() => { registerDefaultRenderers(); resetCounters(); });
    afterEach(() => {
        cleanup();
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('renders the content into each matching tool call', async () => {
        render(ToolUIHost);
        await settle();
        const b = bubble(call('s1', 'get_weather', 'Paris'), call('s2', 'search'), call('s3', 'get_weather', 'Lille'));
        await settle();
        expect(Array.from(b.querySelectorAll('.aparte-tool-ui .weather'), (el) => el.textContent)).toEqual(['Paris:pending', 'Lille:pending']);
        expect(b.querySelector('[data-tool-name="search"]')).not.toBeNull();
    });

    it('keeps the context of where it is declared', async () => {
        render(ToolUIHost);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.weather')?.getAttribute('data-theme')).toBe('brass');
    });

    it('a result update re-renders the same instance', async () => {
        render(ToolUIHost);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        const first = b.querySelector('.weather');
        b.updateSegment('s1', { status: 'resolved', result: '18°C' });
        await settle();
        expect(b.querySelector('.weather')).toBe(first);
        expect(first?.textContent).toBe('Paris:resolved');
        expect(counters.mounts).toBe(1);
    });

    it('takes over a card already on screen when it mounts late', async () => {
        const b = bubble(call('s1', 'get_weather'));
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        render(ToolUIHost);
        await settle();
        expect(b.querySelector('.aparte-tool-ui .weather')?.textContent).toBe('Paris:pending');
    });

    it('unmounting it restores the default row on the card already on screen', async () => {
        const { rerender } = render(ToolUIHost);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.weather')).not.toBeNull();
        await rerender({ show: false });
        await settle();
        expect(b.querySelector('.aparte-tool-ui')).toBeNull();
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        expect(counters.unmounts).toBe(1);
    });

    it('two declarations for one tool: removing the lower one keeps the upper one', async () => {
        const { rerender } = render(ToolUIHost, { props: { lower: true } });
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.weather')).not.toBeNull();
        await rerender({ lower: false });
        await settle();
        expect(b.querySelector('.weather')).not.toBeNull();
        expect(b.querySelector('.lower')).toBeNull();
    });
});

describe('<AparteSegmentUI> for Svelte 5', () => {
    afterEach(() => { cleanup(); document.body.replaceChildren(); });

    it('draws a segment type of your own, and follows its updates', async () => {
        render(SegmentUIHost);
        await settle();
        const b = bubble({ id: 'c1', type: 'chart', points: [1, 2] });
        await settle();
        expect(b.querySelector('.aparte-segment-ui .chart')?.textContent).toBe('1,2');
        b.updateSegment('c1', { points: [1, 2, 3] });
        await settle();
        expect(b.querySelector('.chart')?.textContent).toBe('1,2,3');
    });
});
