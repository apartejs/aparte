import React, { createContext, useContext, useEffect, useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { aparteGlobalConfig, registerAllComponents, registerDefaultRenderers, type AparteSegmentBase, type AparteToolCallSegment } from '@aparte/core';
import { AparteToolUI, AparteSegmentUI } from '../components/AparteToolUI';

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

/** Core's registry redraws in a microtask, and the component hears its mounts in another. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const Weather = ({ tool }: { tool: { input: unknown; status: string } }) => (
    <span className="weather">{(tool.input as { city: string }).city}:{tool.status}</span>
);

describe('<AparteToolUI>', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        cleanup();
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('renders the content into each matching tool call', async () => {
        render(<AparteToolUI name="get_weather">{(tool) => <Weather tool={tool} />}</AparteToolUI>);
        await settle();
        const b = bubble(call('s1', 'get_weather', 'Paris'), call('s2', 'search'), call('s3', 'get_weather', 'Lille'));
        await settle();
        expect(Array.from(b.querySelectorAll('.aparte-tool-ui .weather'), (el) => el.textContent)).toEqual(['Paris:pending', 'Lille:pending']);
        // The other tool keeps core's row.
        expect(b.querySelector('[data-tool-name="search"]')).not.toBeNull();
    });

    it('two calls with the same id in two messages each get their own card', async () => {
        // Local models often number calls per turn, so `call-s1` comes back in the next message.
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<AparteToolUI name="get_weather">{(tool) => <Weather tool={tool} />}</AparteToolUI>);
        await settle();
        const first = bubble(call('s1', 'get_weather', 'Paris'));
        const second = bubble(call('s1', 'get_weather', 'Lille'));
        await settle();
        expect(first.querySelector('.weather')?.textContent).toBe('Paris:pending');
        expect(second.querySelector('.weather')?.textContent).toBe('Lille:pending');
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it('keeps the context of where it is declared', async () => {
        const Theme = createContext('none');
        const Card = () => <span className="themed">{useContext(Theme)}</span>;
        render(
            <Theme.Provider value="brass">
                <AparteToolUI name="get_weather">{() => <Card />}</AparteToolUI>
            </Theme.Provider>,
        );
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.aparte-tool-ui .themed')?.textContent).toBe('brass');
    });

    it('a result update re-renders the same instance', async () => {
        let mounts = 0;
        function Card({ status }: { status: string }) {
            const [id] = useState(() => ++mounts);
            return <span className="card" data-instance={id}>{status}</span>;
        }
        render(<AparteToolUI name="get_weather">{(tool) => <Card status={tool.status} />}</AparteToolUI>);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        const first = b.querySelector('.card');
        act(() => { b.updateSegment('s1', { status: 'resolved', result: '18°C' }); });
        await settle();
        expect(b.querySelector('.card')).toBe(first);
        expect(first?.textContent).toBe('resolved');
        expect(mounts).toBe(1);
    });

    it('takes over a card already on screen when it mounts late', async () => {
        const b = bubble(call('s1', 'get_weather'));
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        render(<AparteToolUI name="get_weather">{(tool) => <Weather tool={tool} />}</AparteToolUI>);
        await settle();
        expect(b.querySelector('.aparte-tool-ui .weather')?.textContent).toBe('Paris:pending');
    });

    it('unmounting it restores the default row on the card already on screen', async () => {
        let unmounted = 0;
        const Card = () => { useEffect(() => () => { unmounted++; }, []); return <span className="card" />; };
        const { unmount } = render(<AparteToolUI name="get_weather">{() => <Card />}</AparteToolUI>);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.card')).not.toBeNull();
        unmount();
        await settle();
        expect(b.querySelector('.aparte-tool-ui')).toBeNull();
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        expect(unmounted).toBe(1);
    });

    it('two declarations for one tool: removing the lower one keeps the upper one', async () => {
        function Page({ lower }: { lower: boolean }) {
            return (
                <>
                    {lower && <AparteToolUI name="get_weather">{() => <span className="lower" />}</AparteToolUI>}
                    <AparteToolUI name="get_weather">{() => <span className="upper" />}</AparteToolUI>
                </>
            );
        }
        const { rerender } = render(<Page lower />);
        await settle();
        const b = bubble(call('s1', 'get_weather'));
        await settle();
        expect(b.querySelector('.upper')).not.toBeNull();
        rerender(<Page lower={false} />);
        await settle();
        expect(b.querySelector('.upper')).not.toBeNull();
        expect(b.querySelector('.lower')).toBeNull();
    });
});

interface ChartSegment extends AparteSegmentBase {
    type: 'chart';
    points: number[];
}

describe('<AparteSegmentUI>', () => {
    afterEach(() => { cleanup(); document.body.replaceChildren(); });

    it('draws a segment type of your own, and follows its updates', async () => {
        render(<AparteSegmentUI<ChartSegment> type="chart">{(s) => <span className="chart">{s.points.join(',')}</span>}</AparteSegmentUI>);
        await settle();
        const b = bubble({ id: 'c1', type: 'chart', points: [1, 2] });
        await settle();
        expect(b.querySelector('.aparte-segment-ui .chart')?.textContent).toBe('1,2');
        act(() => { b.updateSegment('c1', { points: [1, 2, 3] }); });
        await settle();
        expect(b.querySelector('.chart')?.textContent).toBe('1,2,3');
    });
});
