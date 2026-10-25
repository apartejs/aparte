import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { AparteConfig, aparteGlobalConfig } from '../../../config/index.js';
import { attachConfig } from '../../../config/config-context.js';
import {
    defineMountedSegmentRenderer,
    defineMountedToolRenderer,
    getSegmentRenderer,
    overrideSegmentRenderer,
    registerDefaultRenderers,
    registerSegmentRenderer,
    unregisterSegmentRenderer,
} from '../../../renderers/index.js';
import type { AparteSegmentBase, AparteSegmentRenderer, AparteToolCallSegment, AparteToolRenderer } from '../../../types/index.js';

/**
 * The edges a cold review found in the renderer lifecycle: a chat with its own config,
 * a config attached after the rows are drawn, override stacks across `reset()` and direct
 * registrations, a cleanup or a late write that would leak, a rendering-version bump that
 * would remount every card.
 */
type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    updateSegment: (id: string, u: unknown) => void;
    appendToSegment: (id: string, c: string) => void;
    removeSegment: (id: string) => void;
};

const call = (id: string, name: string): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name, input: {} },
} as AparteToolCallSegment);
const rowOf = (b: Element, id: string) => b.querySelector(`.aparte-segments > [data-segment-id="${id}"]`) as HTMLElement | null;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function bubbleIn(parent: HTMLElement = document.body): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    parent.appendChild(b);
    return b;
}

describe('renderer lifecycle — the edges', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        unregisterSegmentRenderer('probe-type', aparteGlobalConfig);
        unregisterSegmentRenderer('chart', aparteGlobalConfig);
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    it('a chat with its own config follows a segment renderer registered on the global one it inherits', async () => {
        const boundary = document.createElement('div');
        document.body.appendChild(boundary);
        attachConfig(boundary, new AparteConfig());
        const b = bubbleIn(boundary);
        b.addSegment({ id: 's1', type: 'probe-type' });
        registerSegmentRenderer({ type: 'probe-type', render: () => '<div class="probe-drawn"></div>' }, aparteGlobalConfig);
        await settle();
        expect(rowOf(b, 's1')?.classList.contains('probe-drawn')).toBe(true);
    });

    it('rows drawn before the chat\'s own config is attached follow the cards it declares', async () => {
        const boundary = document.createElement('div');
        document.body.appendChild(boundary);
        const b = bubbleIn(boundary);
        b.addSegment(call('s1', 'get_weather'));
        const own = new AparteConfig();
        const mount = vi.fn(() => ({ update: () => {}, destroy: () => {} }));
        own.registerToolRenderer('get_weather', defineMountedToolRenderer(mount));
        attachConfig(boundary, own);
        await settle();
        expect(mount).toHaveBeenCalledTimes(1);
        expect(rowOf(b, 's1')?.className).toBe('aparte-tool-ui');
    });

    it('a restore from before reset() does nothing after it', () => {
        const cfg = new AparteConfig();
        const base: AparteToolRenderer = { render: () => 'base' };
        cfg.registerToolRenderer('t', base);
        const restore = cfg.overrideToolRenderer('t', { render: () => 'over' });
        cfg.reset();
        const after: AparteToolRenderer = { render: () => 'after' };
        cfg.overrideToolRenderer('t', after);
        restore();
        expect(cfg.getToolRenderer('t')).toBe(after);
    });

    it('a direct registration made between an override and its restore is kept', () => {
        const cfg = new AparteConfig();
        const restore = cfg.overrideToolRenderer('t', { render: () => 'over' });
        const direct: AparteToolRenderer = { render: () => 'direct' };
        cfg.registerToolRenderer('t', direct);
        restore();
        expect(cfg.getToolRenderer('t')).toBe(direct);
    });

    it('restoring an override of a built-in type on a chat\'s own config gives back what it inherited', () => {
        const builtIn = getSegmentRenderer('code', aparteGlobalConfig)!;
        const globalCustom: AparteSegmentRenderer = { type: 'code', render: () => '<pre class="global-custom"></pre>' };
        registerSegmentRenderer(globalCustom, aparteGlobalConfig);
        try {
            const own = new AparteConfig();
            const restore = overrideSegmentRenderer({ type: 'code', render: () => '<pre class="mine"></pre>' }, own);
            restore();
            expect(getSegmentRenderer('code', own)).toBe(globalCustom);
        } finally {
            registerSegmentRenderer(builtIn, aparteGlobalConfig);
        }
    });

    it('a tool cleanup that throws during a row rebuild does not escape the update', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        aparteGlobalConfig.registerToolRenderer('get_weather', {
            render: (s) => `<div class="mine" data-s="${s.status}"></div>`,
            cleanup: () => { throw new Error('boom'); },
        });
        const b = bubbleIn();
        b.addSegment(call('s1', 'get_weather'));
        expect(() => b.updateSegment('s1', { status: 'resolved' })).not.toThrow();
        expect(rowOf(b, 's1')?.getAttribute('data-s')).toBe('resolved');
        expect(error).toHaveBeenCalled();
    });

    it('a rendering-version bump (a late highlighter) keeps mounted cards mounted', async () => {
        const mount = vi.fn(() => ({ update: () => {}, destroy: () => {} }));
        aparteGlobalConfig.registerToolRenderer('get_weather', defineMountedToolRenderer(mount));
        const b = bubbleIn();
        b.addSegment({ id: 't1', type: 'text', content: 'hello' });
        b.addSegment(call('s1', 'get_weather'));
        const card = rowOf(b, 's1');
        aparteGlobalConfig.setHighlightProvider(async (code) => code);
        await settle();
        expect(mount).toHaveBeenCalledTimes(1);
        expect(rowOf(b, 's1')).toBe(card);
    });

    it('a provider that arrives while the turn streams keeps mounted cards mounted at the end of the turn', async () => {
        const destroy = vi.fn();
        const mount = vi.fn(() => ({ update: () => {}, destroy }));
        aparteGlobalConfig.registerToolRenderer('get_weather', defineMountedToolRenderer(mount));
        const b = bubbleIn() as Bubble & { updateMessage(u: unknown): void };
        b.updateMessage({ status: 'streaming' });
        b.addSegment({ id: 't1', type: 'text', content: 'hello' });
        b.addSegment(call('s1', 'get_weather'));
        const card = rowOf(b, 's1');
        const text = rowOf(b, 't1');
        aparteGlobalConfig.setHighlightProvider(async (code) => code);
        await settle();
        // The live end of a turn: a status, no segments.
        b.updateMessage({ status: 'completed' });
        await settle();
        expect(mount).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(rowOf(b, 's1')).toBe(card);
        // The late provider is still honoured where it applies.
        expect(rowOf(b, 't1')).not.toBe(text);
    });

    it('a replaced tool_call renderer is not redrawn because a tool renderer matches its call', async () => {
        const cleanup = vi.fn();
        const custom: AparteSegmentRenderer = {
            type: 'tool_call',
            render: () => Object.assign(document.createElement('div'), { className: 'custom-call' }),
            cleanup,
        };
        const restore = overrideSegmentRenderer(custom);
        aparteGlobalConfig.registerToolRenderer('get_weather', { render: () => document.createElement('span') } as AparteToolRenderer);
        const b = bubbleIn();
        b.addSegment(call('s1', 'get_weather'));
        const row = rowOf(b, 's1');
        // An unrelated registry change, then a config change: nothing that draws s1 changed.
        aparteGlobalConfig.registerToolRenderer('search', { render: () => document.createElement('span') } as AparteToolRenderer);
        await settle();
        aparteGlobalConfig.setBubbleActions({ copy: true });
        await settle();
        expect(cleanup).not.toHaveBeenCalled();
        expect(rowOf(b, 's1')).toBe(row);
        aparteGlobalConfig.unregisterToolRenderer('search');
        restore();
    });

    it('a direct registration between two overrides survives both restores', () => {
        const tool = () => ({ render: () => document.createElement('i') }) as AparteToolRenderer;
        const [a, b, c] = [tool(), tool(), tool()];
        const restoreA = aparteGlobalConfig.overrideToolRenderer('get_weather', a);
        aparteGlobalConfig.registerToolRenderer('get_weather', c);
        const restoreB = aparteGlobalConfig.overrideToolRenderer('get_weather', b);
        restoreB();
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(c);
        restoreA();
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(c);

        const seg = (): AparteSegmentRenderer => ({ type: 'probe-type', render: () => document.createElement('i') });
        const [sa, sb, sc] = [seg(), seg(), seg()];
        const restoreSa = overrideSegmentRenderer(sa);
        registerSegmentRenderer(sc);
        const restoreSb = overrideSegmentRenderer(sb);
        restoreSb();
        expect(getSegmentRenderer('probe-type')).toBe(sc);
        restoreSa();
        expect(getSegmentRenderer('probe-type')).toBe(sc);
    });

    it('a segment drawn into a bubble already removed is cleaned up too', async () => {
        const cleanup = vi.fn();
        registerSegmentRenderer({ type: 'probe-type', render: () => '<div></div>', cleanup }, aparteGlobalConfig);
        const b = bubbleIn();
        b.remove();
        await settle();
        b.addSegment({ id: 'late', type: 'probe-type' });
        await settle();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('the same id drawn twice releases the first element', () => {
        const cleanup = vi.fn();
        registerSegmentRenderer({ type: 'probe-type', render: () => '<div></div>', cleanup }, aparteGlobalConfig);
        const b = bubbleIn();
        b.addSegment({ id: 'dup', type: 'probe-type' });
        b.addSegment({ id: 'dup', type: 'probe-type' });
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('a mounted segment renderer is updated, not remounted, while its segment streams', () => {
        interface Chart extends AparteSegmentBase { type: 'chart'; content: string }
        const updates: string[] = [];
        const mount = vi.fn((host: HTMLElement, s: Chart) => {
            host.textContent = s.content;
            return { update: (next: Chart) => { updates.push(next.content); host.textContent = next.content; }, destroy: () => {} };
        });
        registerSegmentRenderer(defineMountedSegmentRenderer<Chart>('chart', mount), aparteGlobalConfig);
        const b = bubbleIn();
        b.addSegment({ id: 'c1', type: 'chart', content: '1' });
        b.appendToSegment('c1', '2');
        b.appendToSegment('c1', '3');
        expect(mount).toHaveBeenCalledTimes(1);
        expect(updates).toEqual(['12', '123']);
        expect(rowOf(b, 'c1')?.textContent).toBe('123');
    });
});
