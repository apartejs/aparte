import { describe, it, expect, beforeEach } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupStreamingMarkdownProvider } from './index.js';

/**
 * The streaming path writes DOM directly (bypassing the one-shot sanitizer), so
 * it must enforce the URL policy live. Regression guard for a streamed
 * `[x](javascript:…)` producing a clickable link mid-stream.
 */
describe('@aparte/plugin-streaming-markdown — live URL safety', () => {
    beforeEach(() => {
        setupStreamingMarkdownProvider();
    });

    function streamInto(target: HTMLElement, chunks: string[]): void {
        const r = AparteConfig.createStreamingMarkdownRenderer(target);
        if (!r) throw new Error('no streaming renderer registered');
        for (const c of chunks) r.write(c);
        r.end();
    }

    it('registers a streaming renderer factory', () => {
        expect(AparteConfig.createStreamingMarkdownRenderer(document.createElement('div'))).not.toBeNull();
    });

    it('renders safe markdown incrementally', () => {
        const target = document.createElement('div');
        streamInto(target, ['# ', 'Hello']);
        expect(target.querySelector('h1')?.textContent).toContain('Hello');
    });

    it('drops a javascript: href streamed in a link', () => {
        const target = document.createElement('div');
        streamInto(target, ['[click](javascript:alert(1))']);
        const a = target.querySelector('a');
        expect(a).not.toBeNull();
        expect(a!.getAttribute('href')).toBeNull(); // unsafe scheme was dropped
    });

    it('keeps a safe https href', () => {
        const target = document.createElement('div');
        streamInto(target, ['[ok](https://example.com/page)']);
        expect(target.querySelector('a')!.getAttribute('href')).toBe('https://example.com/page');
    });

    it('drops the unsafe href even when the scheme is split across chunks', () => {
        const target = document.createElement('div');
        streamInto(target, ['[x](java', 'script:alert(1))']);
        const a = target.querySelector('a');
        if (a) expect(a.getAttribute('href')).toBeNull();
    });

    it('drops a javascript: image src', () => {
        const target = document.createElement('div');
        streamInto(target, ['![alt](javascript:alert(1))']);
        const img = target.querySelector('img');
        if (img) expect(img.getAttribute('src')).toBeNull();
    });
});
