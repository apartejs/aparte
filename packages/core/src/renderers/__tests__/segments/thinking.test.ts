/**
 * The reasoning-block renderer: label fallback and collapsed state.
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

describe('default renderer: thinking', () => {
    it('is registered', () => {
        expect(getSegmentRenderer('thinking')).toBeDefined();
    });

    it('renders thinking content', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const seg = { id: 's3', type: 'thinking', content: 'Let me think...', collapsed: false };
        const html = renderer.render(seg as any);
        expect(html).toContain('Let me think...');
    });

    it('escapes a hostile label (XSS) — a host may render a non-hardcoded label', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const seg = { id: 's4', type: 'thinking', label: '<img src=x onerror=alert(1)>', content: 'x', collapsed: false };
        const html = renderer.render(seg as any);
        expect(html).not.toContain('<img src=x onerror=');
        expect(html).toContain('&lt;img src=x onerror=');
    });
});

// ─── default renderer: thinking (label fallback + collapsed state) ────

describe('default renderer: thinking (extra)', () => {
    it('falls back to the locale "thinking" string when no label is given', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const html = renderer.render({ id: 't1', type: 'thinking', content: 'x' } as any);
        expect(html).toContain('<span class="thinking-label">Thinking...</span>');
    });

    it('uses a custom label verbatim (escaped) when provided', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const html = renderer.render({ id: 't2', type: 'thinking', content: 'x', label: 'Reasoning' } as any);
        expect(html).toContain('<span class="thinking-label">Reasoning</span>');
    });

    it('renders <details open> when not collapsed', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const html = renderer.render({ id: 't3', type: 'thinking', content: 'x', collapsed: false } as any);
        expect(html).toMatch(/<details[^>]*\bopen\b[^>]*>/);
    });

    it('renders <details> WITHOUT open when collapsed', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const html = renderer.render({ id: 't4', type: 'thinking', content: 'x', collapsed: true } as any);
        expect(html).not.toMatch(/<details[^>]*\bopen\b[^>]*>/);
    });

    it('update() writes the new content as text (no HTML injection)', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const el = document.createElement('div');
        el.innerHTML = renderer.render({ id: 't5', type: 'thinking', content: 'old', collapsed: false } as any) as string;
        renderer.update!(el, { id: 't5', type: 'thinking', content: '<b>new</b>', collapsed: false } as any);
        const contentEl = el.querySelector('.thinking-content')!;
        expect(contentEl.textContent).toBe('<b>new</b>');
        expect(contentEl.innerHTML).not.toContain('<b>');
    });
});
