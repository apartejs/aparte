import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { defineMountedToolRenderer, registerDefaultRenderers } from '../../../renderers/index.js';
import type { AparteToolCallSegment, AparteToolRenderer } from '../../../types/index.js';

/**
 * A card ALREADY ON SCREEN when the registry changes. A component that declares a tool's
 * card mounts after messages may already be drawn (a restored conversation, a lazy route),
 * and unmounts while they stay: the card has to follow both ways, and nothing else on the
 * page may be drawn again on the way.
 */
type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    updateSegment: (id: string, u: unknown) => void;
    removeSegment: (id: string) => void;
};

const call = (id: string, name: string): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name, input: {} },
} as AparteToolCallSegment);

const rowOf = (b: Bubble, id: string) => b.querySelector(`.aparte-segments > [data-segment-id="${id}"]`) as HTMLElement | null;

function bubble(): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    return b;
}

describe('<aparte-chat-bubble> — the cards on screen follow the registry', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        aparteGlobalConfig.unregisterToolRenderer('search');
        document.body.replaceChildren();
    });

    it('a renderer registered after the card is drawn takes the card over', () => {
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        expect(rowOf(b, 's1')?.classList.contains('aparte-segment-tool-call')).toBe(true);
        const mount = vi.fn((host: HTMLElement) => { host.textContent = 'mine'; return { update: () => {}, destroy: () => {} }; });
        aparteGlobalConfig.registerToolRenderer('get_weather', defineMountedToolRenderer(mount));
        expect(mount).toHaveBeenCalledTimes(1);
        expect(rowOf(b, 's1')?.className).toBe('aparte-tool-ui');
        expect(rowOf(b, 's1')?.textContent).toBe('mine');
    });

    it('taking the renderer off brings core\'s row back on the card already on screen', () => {
        const destroy = vi.fn();
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        const restore = aparteGlobalConfig.overrideToolRenderer('get_weather',
            defineMountedToolRenderer(() => ({ update: () => {}, destroy })));
        restore();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(rowOf(b, 's1')?.classList.contains('aparte-segment-tool-call')).toBe(true);
    });

    it('a registry change leaves the cards of other tools untouched', () => {
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        b.addSegment(call('s2', 'search'));
        const other = rowOf(b, 's2');
        aparteGlobalConfig.registerToolRenderer('get_weather', { render: () => '<div class="mine"></div>' });
        expect(rowOf(b, 's2')).toBe(other);
        expect(rowOf(b, 's1')?.classList.contains('mine')).toBe(true);
    });

    it('a newly registered renderer draws its card before it updates it, and the old one cleans up', () => {
        const oldCleanup = vi.fn();
        const first: AparteToolRenderer = { render: () => '<div class="first"></div>', cleanup: oldCleanup };
        const seen: string[] = [];
        const second: AparteToolRenderer = {
            render: () => '<div class="second"></div>',
            update: (el) => { seen.push(el.className); },
        };
        aparteGlobalConfig.registerToolRenderer('get_weather', first);
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        aparteGlobalConfig.registerToolRenderer('get_weather', second);
        expect(oldCleanup).toHaveBeenCalledTimes(1);
        expect(seen).toEqual([]);   // drawn by `render`, not patched into the old markup
        b.updateSegment('s1', { status: 'resolved' });
        expect(seen).toEqual(['second']);
    });
});
