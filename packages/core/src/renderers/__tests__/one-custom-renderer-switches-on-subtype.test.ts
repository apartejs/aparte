import { describe, it, expect, vi } from 'vitest';

/**
 * The custom segment's `@example`, executed.
 *
 * Renderers are keyed on `type`, so `subType` never reaches the registry: one renderer
 * claims `custom` and switches inside. The example on `AparteCustomSegment` used to
 * show a segment whose `subType` was `'weather-widget'` beside a sentence about "no
 * renderer registered for `subType`", which reads as if the registry looked the
 * `subType` up. It does not, and an author who believed it registered a renderer for
 * `'weather-widget'` and saw nothing.
 *
 * This file is the example. Change one and change the other.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { AparteClient } from '../../client/aparte-client.js';
import { registerSegmentRenderer } from '../segment-renderers.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteCustomSegment, AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

/** The one renderer, exactly as the `@example` writes it. */
const viewsRenderer = {
    type: 'custom',
    render(segment: AparteCustomSegment): HTMLElement {
        const data = (segment.data ?? {}) as Record<string, unknown>;
        const el = document.createElement('div');
        switch (segment.subType) {
            case 'weather':
                el.className = 'weather';
                el.textContent = `${data['city']} — ${data['celsius']}°C`;
                break;
            case 'poll':
                el.className = 'poll';
                el.textContent = String(data['question']);
                break;
            default:
                el.className = 'unknown-view';
                el.textContent = segment.fallback ?? '';
        }
        return el;
    },
};

function bubbleWith(segments: AparteSegment[]): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', `m-${Math.random().toString(36).slice(2)}`);
    document.body.appendChild(el);
    el.setSegments(segments);
    return el;
}

describe('one renderer for type: custom, switching on subType', () => {
    it('draws two subTypes two ways, and falls back on a third', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        new AparteClient();
        registerSegmentRenderer(viewsRenderer, aparteGlobalConfig);

        const weather = bubbleWith([
            { id: 's1', type: 'custom', subType: 'weather', data: { city: 'Lille', celsius: 11 } },
        ]);
        expect(weather.querySelector('.weather')?.textContent).toBe('Lille — 11°C');

        const poll = bubbleWith([
            { id: 's2', type: 'custom', subType: 'poll', data: { question: 'Ship it?' } },
        ]);
        expect(poll.querySelector('.poll')?.textContent).toBe('Ship it?');

        const unknown = bubbleWith([
            { id: 's3', type: 'custom', subType: 'gantt', fallback: 'Three tasks, ending Friday.' },
        ]);
        expect(unknown.querySelector('.unknown-view')?.textContent).toBe('Three tasks, ending Friday.');

        for (const el of [weather, poll, unknown]) el.remove();
        warn.mockRestore();
    });

    it('leaves an independent view its own type — the registry keys on type', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        new AparteClient();
        registerSegmentRenderer(
            { type: 'chart', render: () => '<div class="chart"></div>' },
            aparteGlobalConfig,
        );

        const chart = bubbleWith([{ id: 's4', type: 'chart' } as unknown as AparteSegment]);
        expect(chart.querySelector('.chart')).not.toBeNull();

        // Registering under a `subType` reaches nothing: the key is `type`.
        registerSegmentRenderer(
            { type: 'weather', render: () => '<div class="never"></div>' },
            aparteGlobalConfig,
        );
        const stillCustom = bubbleWith([
            { id: 's5', type: 'custom', subType: 'weather', data: { city: 'Lille', celsius: 11 } },
        ]);
        expect(stillCustom.querySelector('.never')).toBeNull();
        expect(stillCustom.querySelector('.weather')?.textContent).toBe('Lille — 11°C');

        chart.remove();
        stillCustom.remove();
        warn.mockRestore();
    });
});
