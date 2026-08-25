/**
 * The error renderer and its built-in fallback markup.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

describe('default renderer: error', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('is registered', () => {
        expect(getSegmentRenderer('error')).toBeDefined();
    });

    it('renders error message', () => {
        const renderer = getSegmentRenderer('error')!;
        const seg = { id: 's4', type: 'error', content: 'Something went wrong', code: 'FAIL' };
        const html = renderer.render(seg as any);
        expect(html).toContain('Something went wrong');
    });

    it('defers to aparteGlobalConfig.setErrorRenderer (string output)', () => {
        aparteGlobalConfig.setErrorRenderer(({ message }) => `<div class="custom-err">${message}!!</div>`);
        const out = getSegmentRenderer('error')!.render({ id: 'e1', type: 'error', content: 'boom', details: 'X' } as any);
        expect(out).toContain('custom-err');
        expect(out).toContain('boom!!');
    });

    it('defers to aparteGlobalConfig.setErrorRenderer (HTMLElement, tagged with data-segment-id)', () => {
        aparteGlobalConfig.setErrorRenderer(() => {
            const el = document.createElement('div');
            el.className = 'el-err';
            return el;
        });
        const out = getSegmentRenderer('error')!.render({ id: 'e2', type: 'error', content: 'boom' } as any);
        expect(out).toBeInstanceOf(HTMLElement);
        expect((out as HTMLElement).getAttribute('data-segment-id')).toBe('e2');
    });
});

// ─── default renderer: error (built-in fallback markup, no custom renderer) ─

describe('default renderer: error (built-in fallback)', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('renders an icon, the "Error" title and the escaped message', () => {
        const renderer = getSegmentRenderer('error')!;
        const html = renderer.render({ id: 'e10', type: 'error', content: '<script>alert(1)</script>' } as any) as string;
        expect(html).toContain('class="aparte-error-icon-wrapper"');
        expect(html).toContain('<div class="aparte-error-title">Error</div>');
        expect(html).toContain('<div class="aparte-error-message">&lt;script&gt;alert(1)&lt;/script&gt;</div>');
        expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('omits the details block entirely when details is not provided', () => {
        const renderer = getSegmentRenderer('error')!;
        const html = renderer.render({ id: 'e11', type: 'error', content: 'boom' } as any) as string;
        expect(html).not.toContain('aparte-error-details');
    });

    it('renders an escaped details block when provided', () => {
        const renderer = getSegmentRenderer('error')!;
        const html = renderer.render({ id: 'e12', type: 'error', content: 'boom', details: '<img src=x onerror=alert(1)>' } as any) as string;
        expect(html).toContain('class="aparte-error-details"');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img src=x onerror=');
    });

    it('carries the segment id (escaped) on data-segment-id', () => {
        const renderer = getSegmentRenderer('error')!;
        const html = renderer.render({ id: '"><img src=x>', type: 'error', content: 'boom' } as any) as string;
        expect(html).not.toContain('"><img src=x>');
    });
});
