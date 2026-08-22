/**
 * The waiting indicator between pipeline stages.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

describe('default renderer: pipeline-waiting', () => {
    it('is registered', () => {
        expect(getSegmentRenderer('pipeline-waiting')).toBeDefined();
    });

    it('renders three pulsing dots with a status role and aria-label', () => {
        const renderer = getSegmentRenderer('pipeline-waiting')!;
        const html = renderer.render({ id: 'pw1', type: 'pipeline-waiting' } as any);
        // A renderer may return an element; this one returns markup, and the
        // assertions below are string-only — narrow instead of casting.
        if (typeof html !== 'string') throw new Error('expected HTML markup, got an element');
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-label="Generating…"');
        expect((html.match(/pw-dot/g) || []).length).toBe(3);
    });

    it('auto-removes itself once a sibling segment is appended after it', async () => {
        const renderer = getSegmentRenderer('pipeline-waiting')!;
        const parent = document.createElement('div');
        const el = document.createElement('div');
        el.innerHTML = renderer.render({ id: 'pw2', type: 'pipeline-waiting' } as any) as string;
        const waitingEl = el.firstElementChild as HTMLElement;
        parent.appendChild(waitingEl);
        renderer.setup!(waitingEl, { id: 'pw2', type: 'pipeline-waiting' } as any);

        const sibling = document.createElement('div');
        parent.appendChild(sibling);

        // MutationObserver callbacks run as a microtask.
        await Promise.resolve();
        await new Promise(r => setTimeout(r, 0));
        expect(parent.contains(waitingEl)).toBe(false);
    });
});
