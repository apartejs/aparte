// @vitest-environment jsdom
/**
 * An activity is drawn by the renderer the app registered for its type, and redrawn IN PLACE
 * when the agent sends it again: `update` is called on the element `render` made, which is
 * never rebuilt. With no renderer for its type it draws nothing and takes no room — a turn
 * that holds nothing else leaves no orphan header — and it is still kept on the message, so a
 * renderer registered later, or a reload, draws it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStreamAdapter, type AparteStreamRunEvent } from '../../../client/stream-adapter.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import '../../viewport/aparte-chat-viewport.js';
import '../aparte-chat-bubble.js';
import type { AparteActivityRenderer, AparteActivitySegment, AparteMessage, AparteSegment } from '../../../types/index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    getMessage(id: string): AparteMessage | undefined;
    addSegment(segment: AparteSegment): void;
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
};

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

async function streaming(): Promise<{ viewport: Viewport; emit: (e: AparteStreamRunEvent) => void }> {
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(viewport);
    await vi.waitFor(() => expect(typeof viewport.appendMessage).toBe('function'));
    viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
    const emit = createStreamAdapter({ target: viewport, config: aparteGlobalConfig, messageId: 'a1', observe: false });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    return { viewport, emit };
}

const progress = (read: number) => ({ type: 'activity' as const, id: 'p1', activityType: 'search-progress', content: { read, of: 5 } });
const rowOf = (root: ParentNode) => root.querySelector<HTMLElement>('[data-segment-id="activity-p1"]');
const sentence = (s: AparteActivitySegment) => {
    const { read, of } = s.content as { read: number; of: number };
    return `${read} of ${of} sources read`;
};

function counting(): AparteActivityRenderer & { renders: number; updates: number } {
    const r = {
        renders: 0,
        updates: 0,
        render(s: AparteActivitySegment) {
            r.renders += 1;
            const el = document.createElement('p');
            el.className = 'search-progress';
            el.textContent = sentence(s);
            return el;
        },
        update(el: HTMLElement, s: AparteActivitySegment) {
            r.updates += 1;
            el.textContent = sentence(s);
        },
    };
    return r;
}

describe('an activity is drawn by the renderer of its type', () => {
    it('drawn once, then patched in place by update — never rebuilt', async () => {
        const renderer = counting();
        aparteGlobalConfig.registerActivityRenderer('search-progress', renderer);
        const { viewport, emit } = await streaming();
        emit(progress(0));
        const first = rowOf(viewport);
        expect(first?.textContent).toBe('0 of 5 sources read');
        emit(progress(3));
        expect(rowOf(viewport)).toBe(first);
        expect(first!.textContent).toBe('3 of 5 sources read');
        expect(renderer.renders).toBe(1);
        expect(renderer.updates).toBe(1);
        expect(viewport.querySelectorAll('.search-progress')).toHaveLength(1);
    });

    it('a renderer of another type does not draw it', async () => {
        aparteGlobalConfig.registerActivityRenderer('plan', counting());
        const { viewport, emit } = await streaming();
        emit(progress(1));
        expect(viewport.querySelector('.search-progress')).toBeNull();
        expect(rowOf(viewport)?.hidden).toBe(true);
    });

    it('without a renderer: kept on the message, nothing drawn, no room, no orphan header', async () => {
        const { viewport, emit } = await streaming();
        emit(progress(1));
        emit(progress(2));
        emit({ type: 'run-done' });
        const row = rowOf(viewport)!;
        expect(row.hidden).toBe(true);
        expect(row.childElementCount).toBe(0);
        expect(row.textContent).toBe('');
        expect(viewport.querySelector('.aparte-message')!.hasAttribute('data-empty')).toBe(true);
        expect(viewport.getMessage('a1')!.segments).toEqual([
            expect.objectContaining({ type: 'activity', activityId: 'p1', activityType: 'search-progress', content: { read: 2, of: 5 } }),
        ]);
    });

    it('a renderer registered later draws it where it stands; taken off, it draws nothing again', async () => {
        const { viewport, emit } = await streaming();
        emit({ type: 'text-delta', delta: 'Before.' });
        emit(progress(4));
        emit({ type: 'text-delta', delta: 'After.' });
        emit({ type: 'text-flush' });
        const off = aparteGlobalConfig.registerActivityRenderer('search-progress', counting());
        await vi.waitFor(() => expect(rowOf(viewport)?.textContent).toBe('4 of 5 sources read'));
        const order = [...viewport.querySelectorAll('[data-segment-id]')].map((el) => el.textContent);
        expect(order).toEqual(['Before.', '4 of 5 sources read', 'After.']);
        off();
        await vi.waitFor(() => expect(rowOf(viewport)?.hidden).toBe(true));
    });

    it('saved with the message, and drawn again from it on reload', async () => {
        aparteGlobalConfig.registerActivityRenderer('search-progress', counting());
        const { viewport, emit } = await streaming();
        emit(progress(5));
        emit({ type: 'run-done' });
        const saved = JSON.parse(JSON.stringify(viewport.getMessage('a1'))) as AparteMessage;
        document.body.innerHTML = '';

        const reloaded = document.createElement('aparte-chat-viewport') as Viewport;
        document.body.appendChild(reloaded);
        await vi.waitFor(() => expect(typeof reloaded.appendMessage).toBe('function'));
        reloaded.appendMessage(saved);
        expect(rowOf(reloaded)?.textContent).toBe('5 of 5 sources read');
    });

    it('a renderer without update is drawn again on each change, and its old element cleaned up', async () => {
        const cleaned: string[] = [];
        aparteGlobalConfig.registerActivityRenderer('search-progress', {
            render: (s) => `<p class="search-progress">${sentence(s)}</p>`,
            cleanup: (el) => { cleaned.push(el.textContent ?? ''); },
        });
        const { viewport, emit } = await streaming();
        emit(progress(1));
        emit(progress(2));
        expect(rowOf(viewport)?.textContent).toBe('2 of 5 sources read');
        expect(viewport.querySelectorAll('.search-progress')).toHaveLength(1);
        expect(cleaned).toEqual(['1 of 5 sources read']);
    });
});
