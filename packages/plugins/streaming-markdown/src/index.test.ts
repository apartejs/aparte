import { describe, it, expect, beforeEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
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
        const r = aparteGlobalConfig.createStreamingMarkdownRenderer(target);
        if (!r) throw new Error('no streaming renderer registered');
        for (const c of chunks) r.write(c);
        r.end();
    }

    it('registers a streaming renderer factory', () => {
        expect(aparteGlobalConfig.createStreamingMarkdownRenderer(document.createElement('div'))).not.toBeNull();
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

/**
 * The other half of the same story. Core's sanitizer sends a model's external
 * link to its own tab (`target="_blank" rel="noopener noreferrer"`) because a
 * bare anchor navigates the frame the chat lives in — in an Electron window, the
 * whole app. That runs on the one-shot re-render at settle, and the streaming
 * path writes DOM directly, so until this every streamed link was a bare
 * frame-navigating anchor for the length of the reply — clickable the whole time.
 */
describe('@aparte/plugin-streaming-markdown — external links while the message streams', () => {
    beforeEach(() => {
        setupStreamingMarkdownProvider();
    });

    function streamInto(target: HTMLElement, chunks: string[]): void {
        const r = aparteGlobalConfig.createStreamingMarkdownRenderer(target);
        if (!r) throw new Error('no streaming renderer registered');
        for (const c of chunks) r.write(c);
        r.end();
    }

    function anchor(markdown: string): HTMLAnchorElement {
        const target = document.createElement('div');
        streamInto(target, [markdown]);
        const a = target.querySelector('a');
        if (!a) throw new Error('no anchor rendered');
        return a;
    }

    it('opens a streamed https link in its own tab, hardened', () => {
        const a = anchor('[ok](https://example.com/page)');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('hardens a scheme-relative //host the same way core does', () => {
        const a = anchor('[ok](//attacker.example/phish)');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    });

    /*
     * The two spellings a URL parser resolves off-site but `^https?://` never
     * saw: a backslash is a slash on a special scheme, and a single slash after
     * a scheme that differs from the page's enters authority state. Measured
     * with Node's WHATWG URL against base `https://site.example/chat/`:
     * `/\evil.example` → `https://evil.example/`, `http:/evil.example` →
     * `http://evil.example/`. Same list core's sanitizer carries.
     */
    for (const [label, url] of [
        ['a backslash for a slash', '/\\evil.example'],
        ['one slash after a scheme', 'http:/evil.example'],
        ['one slash and a backslash', 'http:/\\evil.example'],
    ] as const) {
        it(`hardens ${label} (${url})`, () => {
            const a = anchor(`[ok](${url})`);
            expect(a.getAttribute('href')).toBe(url);
            expect(a.getAttribute('target')).toBe('_blank');
            expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        });
    }

    it('leaves a same-site link in this tab', () => {
        const a = anchor('[docs](/docs/page)');
        expect(a.getAttribute('target')).toBeNull();
        expect(a.getAttribute('rel')).toBeNull();
    });

    it('leaves an in-page anchor alone', () => {
        const a = anchor('[top](#top)');
        expect(a.getAttribute('target')).toBeNull();
    });

    it('sets nothing on a link whose href was refused — there is no href to open', () => {
        const a = anchor('[x](javascript:alert(1))');
        expect(a.getAttribute('href')).toBeNull();
        expect(a.getAttribute('target')).toBeNull();
    });

    it('does not touch an image', () => {
        const target = document.createElement('div');
        streamInto(target, ['![alt](https://example.com/a.png)']);
        const img = target.querySelector('img');
        expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
        expect(img?.getAttribute('target')).toBeNull();
    });
});

/**
 * The third sink, and the one core's sanitizer names in its own comment: a code
 * fence's info string becomes the `<code>` element's `class`, verbatim. So a
 * legal fence — three backticks then `aparte-approval-option aparte-btn` — dressed
 * model text in core's own recipes for the whole length of the reply, and a
 * `position: fixed` one (`.aparte-select-dropdown`, `.aparte-sidebar__scrim`)
 * repainted the page around the chat.
 *
 * The class written now is `language-<token>`, which is what every one-shot
 * Markdown renderer emits for a fence: the streamed DOM and the settled DOM stop
 * diverging, `language-*` is deliberately exempt from the sanitizer's class
 * filter, and `highlightMarkdownFences` can finally read a streamed fence's
 * language.
 */
describe('@aparte/plugin-streaming-markdown — a code fence cannot wear core’s classes', () => {
    beforeEach(() => {
        setupStreamingMarkdownProvider();
    });

    function fence(info: string): HTMLElement {
        const target = document.createElement('div');
        const r = aparteGlobalConfig.createStreamingMarkdownRenderer(target);
        if (!r) throw new Error('no streaming renderer registered');
        r.write('```' + info + '\nApprove\n```');
        r.end();
        const code = target.querySelector('code');
        if (!code) throw new Error('no code block rendered');
        return code;
    }

    it('gives a forged fence no aparte- class at all', () => {
        const code = fence('aparte-approval-option aparte-btn aparte-btn--solid');
        // The same test core's sanitizer applies to a class token: does it START
        // with the prefix core owns. `language-aparte-…` is not one of ours, and it
        // is exactly what the one-shot renderer produces for the same fence.
        expect([...code.classList].some((c) => /^aparte-/i.test(c))).toBe(false);
        expect(code.className).toBe('language-aparte-approval-option');
    });

    it('emits language-<lang> for an ordinary fence, the way a one-shot renderer does', () => {
        expect(fence('ts').className).toBe('language-ts');
    });

    it('keeps only the first token of the info string', () => {
        expect(fence('js title="app.js"').className).toBe('language-js');
    });

    it('drops the characters a language token cannot contain', () => {
        expect(fence('c++').className).toBe('language-c++');
        expect(fence('py<script>').className).toBe('language-py');
    });

    it('writes no class when the info string leaves nothing', () => {
        expect(fence('<>&').hasAttribute('class')).toBe(false);
        expect(fence('').hasAttribute('class')).toBe(false);
    });
});
