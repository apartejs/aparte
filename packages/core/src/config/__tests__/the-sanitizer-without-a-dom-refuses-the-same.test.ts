import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultSanitizer as s, RESERVED_ATTRIBUTES, RESERVED_ATTRIBUTE_PREFIXES } from '../sanitize';

/*
 * A runtime with no DOMParser (SSR, a Worker) gets the same attribute rule as a browser: the
 * markup that cannot press a button, move a boundary or wear a control in the browser cannot
 * do it in a server render either. Each input here goes through both paths, and what a browser
 * would build from the two answers has to be the same.
 */

/** The answer of the DOM-free branch. */
function withoutDom(html: string): string {
    vi.stubGlobal('DOMParser', undefined);
    try { return s(html); } finally { vi.unstubAllGlobals(); }
}

/** What a browser builds from an answer: the same tree reads the same. */
const built = (answer: string): string => new DOMParser().parseFromString(answer, 'text/html').body.innerHTML;

afterEach(() => { vi.unstubAllGlobals(); });

describe('with no DOMParser, the sanitizer refuses what core reads', () => {
    const reserved = [...RESERVED_ATTRIBUTES, ...RESERVED_ATTRIBUTE_PREFIXES.map((p) => `${p}anything`)];

    it.each(reserved)('drops %s and keeps an inert data attribute beside it', (name) => {
        const out = withoutDom(`<span ${name}="x" data-line="3">text</span>`);
        expect(built(out)).not.toContain(name);
        expect(built(out)).toContain('data-line="3"');
    });

    it('reads the whole list (a corpus that silently shrinks is the failure worth catching)', () => {
        expect(reserved.length).toBeGreaterThan(15);
    });

    it('turns the forged approval button into a plain span', () => {
        const forged = '<span data-aparte-dialog-open="settings" data-aparte-chat data-aparte-host data-segment-id="s1" data-action="retry" data-checkpoint-action="restore" role="button" class="aparte-btn aparte-approval-option" style="position:fixed;inset:0;z-index:9999" id="composer" tabindex="0">Approve</span>';
        expect(withoutDom(forged)).toBe('<span>Approve</span>');
    });

    it('drops a widget role, an aparte- class, a layout style, an id, a name and a tabindex', () => {
        expect(withoutDom('<div role="note textbox" class="aparte-btn keep" style="color:red;position:fixed" id="a" name="b" tabindex="0">x</div>'))
            .toBe('<div class="keep" style="color:red">x</div>');
    });

    it('reads an attribute the way a browser tokenizes it', () => {
        for (const html of [
            '<span data-aparte-chat/data-line=3>x</span>',
            '<span\tdata-aparte-chat\n=\n"x">x</span>',
            '<span data-line="3"data-aparte-chat="x">x</span>',
            '<span data-aparte-chat=x data-line=3>x</span>',
            '<span DATA-APARTE-CHAT="x" data-line=3>x</span>',
            '<span data-aparte-host data-aparte-host="y" data-line=3>x</span>',
            '<span data-aparte-chat=\'x>y\' data-line=3>x</span>',
            '<span data-aparte-c&#104;at="x" data-line=3>x</span>',
        ]) {
            const out = built(withoutDom(html));
            expect(out, html).not.toMatch(/data-aparte-/);
        }
    });

    it('does not let a comment or a quote hide a tag from the scan', () => {
        for (const html of [
            '<!-- <a x="--> <span data-aparte-chat data-line=3>x</span> " -->',
            '<!--><span data-aparte-chat data-line=3>x</span>-->',
            '<!---><span data-aparte-chat data-line=3>x</span>-->',
            '<!-- a --!><span data-aparte-chat data-line=3>x</span>',
            '<!x "><span data-aparte-chat data-line=3>x</span>',
            '</ x "><span data-aparte-chat data-line=3>x</span>',
            '<!<!-- y -->-- z --><span data-aparte-chat data-line=3>x</span>',
        ]) {
            expect(built(withoutDom(html)), html).not.toMatch(/data-aparte-/);
        }
    });

    it('judges an attribute on what the browser decodes, and writes it back escaped', () => {
        expect(withoutDom('<a href="java&#115;cript:alert(1)">x</a>')).not.toContain('script');
        expect(withoutDom('<a href="javascript&colon;alert(1)">x</a>')).not.toContain('script');
        expect(withoutDom('<span style="background:u&#114;l(https://e.example/x)">x</span>')).toBe('<span>x</span>');
        expect(withoutDom('<span style="background:u&lpar;https://e.example/x)">x</span>')).toBe('<span>x</span>');
        expect(withoutDom('<span title="a &quot;quoted&quot; <b>">x</span>')).toBe('<span title="a &quot;quoted&quot; &lt;b&gt;">x</span>');
    });

    it('keeps the task-list checkbox markdown-it and GitHub write, as the DOM path does', () => {
        const html = '<li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> done</li><li><input type="checkbox" id="x" disabled=""> todo</li>';
        expect(withoutDom(html)).toBe('<li class="task-list-item"><input type="checkbox" checked disabled class="task-list-item-checkbox"> done</li><li><input type="checkbox" disabled> todo</li>');
        const box = new DOMParser().parseFromString(withoutDom(html), 'text/html').querySelector('input.task-list-item-checkbox') as HTMLInputElement;
        expect([box.type, box.checked, box.disabled]).toEqual(['checkbox', true, true]);
    });

    it('answers like the DOM path on ordinary markup', () => {
        for (const html of [
            '<p>hello <strong>world</strong></p>',
            '<a href="https://example.com/x?a=1&amp;b=2">docs</a>',
            '<a href="/local" target="_self">here</a>',
            '<a href="https://example.com" target="_top">out</a>',
            '<img src="https://example.com/a.png" alt="a" width="10">',
            '<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>',
            '<table><thead><tr><th colspan="2">h</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
            '<ol start="3"><li>c</li></ol>',
            'a < b and 3 <4 and <3',
            '<custom-tag>kept text</custom-tag>',
            '<br/><hr>',
        ]) {
            expect(built(withoutDom(html)), html).toBe(built(s(html)));
        }
    });

    it('stays linear on a long source', () => {
        const started = performance.now();
        withoutDom('<span ' + 'a '.repeat(50_000) + '>x</span>');
        withoutDom('<'.repeat(50_000));
        withoutDom('<a b="' + '<a '.repeat(30_000));
        withoutDom('<!--'.repeat(20_000));
        expect(performance.now() - started).toBeLessThan(500);
    });
});

/** What a browser builds from an answer, as a tree to ask questions of. */
const parse = (answer: string): Document => new DOMParser().parseFromString(answer, 'text/html');

describe('with no DOMParser, text that is left next to a dropped construct is still text', () => {
    // A lone `<` used to be written raw, so `<<x>script>` lost the `<x>` and spelled `<script>`.
    const splices = [
        '<<x>script>alert(1)<<x>/script>',
        '<<!x>script>alert(1)<</ x>/script>',
        '<<?x>script>alert(1)<<?x>/script>',
        '<<x>iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"><<x>/iframe>',
        '<<x>iframe src="javascript&colon;alert(1)">',
        '<<x>a href="java&#x9;script:alert(1)">x',
        '<<input type=text>svg><<x>style>*{}<<x>/style>',
        '<<x>base href="//evil.example/">',
        '<<x>meta http-equiv="refresh" content="0;url=//evil.example/">',
        '<<x>div data-aparte-dialog-open="settings" role="button" class="aparte-btn" style="position:fixed;inset:0">x',
        '<p>Hi<<x>script>globalThis.PWNED = 1<<x>/script></p>',
        '<<p>/script><script>alert(1)</script>',
    ];

    it.each(splices)('builds no element of its own from %s', (html) => {
        const doc = parse(withoutDom(html));
        for (const el of doc.body.querySelectorAll('*')) {
            expect(['SCRIPT', 'IFRAME', 'SVG', 'STYLE', 'BASE', 'META', 'LINK'], el.tagName).not.toContain(el.tagName.toUpperCase());
            expect(el.getAttributeNames().filter((n) => n.startsWith('on') || n === 'srcdoc' || n.startsWith('data-aparte-')), el.tagName).toEqual([]);
            expect(el.getAttribute('role')).toBeNull();
            expect(el.getAttribute('style')).toBeNull();
            expect(el.getAttribute('class')).toBeNull();
            expect(el.getAttribute('href') ?? '').not.toMatch(/^\s*java/i);
        }
        expect(doc.head.children.length).toBe(0);
    });

    it('writes the stray `<` as text', () => {
        expect(withoutDom('a <<x>b')).toBe('a &lt;b');
        expect(withoutDom('1 < 2')).toBe('1 &lt; 2');
    });
});

describe('with no DOMParser, a harmless attribute value cannot unquote the next attribute', () => {
    // The old post-passes deleted ` onq=1` or `href=javascript:x` from INSIDE a quoted value and
    // took its closing quote with them, so the next tag's escaped text became live attributes.
    const smuggles = [
        '<a title="x onq=1">Read more</a><b title=" href=\'java&#9;script:alert(1)\' style=\'position:fixed;inset:0\' data-aparte-dialog-open=\'x\' ">',
        '<a title="href=javascript:x">y</a><b title=" href=\'java&#9;script:alert(1)\' ">',
        '<a title="x onclick=1">y</a><i title="onclick=1">z</i>',
        '<span title="\' onmouseover=\'alert(1)">x</span>',
    ];

    it.each(smuggles)('keeps every value inside its own attribute in %s', (html) => {
        const doc = parse(withoutDom(html));
        for (const el of doc.body.querySelectorAll('*')) {
            expect(el.getAttributeNames().filter((n) => n !== 'title'), el.tagName).toEqual([]);
        }
    });

    it('keeps a value that looks like an attribute exactly as written', () => {
        const out = withoutDom('<a title="x onq=1">y</a>');
        expect(parse(out).querySelector('a')!.getAttribute('title')).toBe('x onq=1');
        expect(parse(withoutDom('<a title="href=javascript:x">y</a>')).querySelector('a')!.getAttribute('title')).toBe('href=javascript:x');
    });

    it('escapes a single quote in a value', () => {
        expect(withoutDom(`<span title="it's">x</span>`)).toBe('<span title="it&#39;s">x</span>');
    });
});

describe('with no DOMParser, hostile input costs time in proportion to its length', () => {
    // Each of these was quadratic: one pass per nesting level, and a scan to the end of the text
    // for every opening `<script ` / `<svg ` that never closed.
    const inputs: Array<[string, string]> = [
        ['nested comments', '<!-'.repeat(12_500) + '<!--x-->' + '-y-->'.repeat(12_500)],
        ['<svg > never closed', '<svg>'.repeat(20_000)],
        ['<svg  with no end', '<svg '.repeat(20_000)],
        ['<script  with no end', '<script '.repeat(20_000)],
        ['<iframe>a', '<iframe>a'.repeat(12_000)],
        ['<script>x', '<script>x'.repeat(12_000)],
        ['closed comments', '<!--a-->'.repeat(15_000)],
        ['unclosed comments', '<!--a'.repeat(20_000)],
        ['stray <', '<<x>'.repeat(25_000)],
    ];

    it.each(inputs)('stays linear on %s', (_name, html) => {
        vi.stubGlobal('DOMParser', undefined);
        const started = performance.now();
        s(html);
        const took = performance.now() - started;
        vi.unstubAllGlobals();
        expect(took).toBeLessThan(150);
    });
});

describe('a widget role is refused on both paths, whatever the widget', () => {
    // WAI-ARIA 1.2 widget roles that model markup must not wear, read back by a real parser.
    it.each(['progressbar', 'tabpanel', 'textbox', 'tab', 'tablist'])('drops role=%s', (role) => {
        const html = `<div role="${role}">x</div><span role="note ${role}">y</span>`;
        for (const out of [withoutDom(html), s(html)]) {
            const doc = new DOMParser().parseFromString(out, 'text/html');
            expect(doc.querySelectorAll('[role]').length).toBe(0);
        }
    });
});

describe('srcset: a scheme is judged wherever a browser would read one', () => {
    const srcsetOf = (html: string): string | null => {
        const doc = new DOMParser().parseFromString(withoutDom(html), 'text/html');
        return doc.querySelector('img, source')?.getAttribute('srcset') ?? null;
    };

    it.each([
        'x,javascript:a',
        '\u0001javascript:a',
        'a.png 1x,\tjavascript:a',
        'https:x,vbscript:a',
        'data:image/png;base64,AAA 1x,javascript:alert(1) 2x',
        'data:text/html,<b>',
    ])('drops %j', (value) => {
        expect(srcsetOf(`<img srcset="${value}">`)).toBeNull();
    });

    it.each(['a.png 1x, b.png 2x', 'https://cdn.example/a.png 1x', 'data:image/png;base64,AAA 2x, small.png 1x'])('keeps %j', (value) => {
        expect(srcsetOf(`<img srcset="${value}">`)).toBe(value);
    });

    // Each of these started a scan at every position of the run, quadratic: 100 000 chars took seconds.
    it.each([
        ['a'.repeat(100_000)],
        ['a.'.repeat(50_000)],
        ['a-'.repeat(50_000)],
        ['a1+-'.repeat(25_000)],
    ])('stays linear on a long run of scheme characters (%#)', (value) => {
        for (const html of [`<img srcset="${value}">`, `<picture><source srcset="${value}"></picture>`]) {
            vi.stubGlobal('DOMParser', undefined);
            const started = performance.now();
            s(html);
            const took = performance.now() - started;
            vi.unstubAllGlobals();
            expect(took).toBeLessThan(150);
        }
    });
});

describe('with no DOMParser, a comment ends where a browser ends it', () => {
    it.each([
        ['<p>a<!-- x -->b</p>', '<p>ab</p>'],
        ['a<!-->b', 'ab'],
        ['a<!--->b', 'ab'],
        ['a<!-- x --!>b', 'ab'],
        ['a<!----> b', 'a b'],
        ['a<!-- x', 'a'],
        ['<a title="<!--">x</a>-->', '<a title="&lt;!--">x</a>-->'],
    ])('reads %s', (html, expected) => {
        expect(withoutDom(html)).toBe(expected);
    });
});
