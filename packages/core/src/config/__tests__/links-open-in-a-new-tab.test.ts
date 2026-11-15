import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig, renderingVersionOf } from '../aparte-config';
import { defaultSanitizer } from '../sanitize';
import { applyLinkTargetWithoutDom } from '../link-target';

/*
 * Where a link a reply holds opens (#205). A coding agent's reply is full of links to files —
 * `[package.json](package.json)` — and followed in place, a same-site link replaces the page
 * the chat lives in: in a single-page app or an Electron window, the whole application and the
 * conversation with it. So every link a reply holds opens in a new tab by default, same-site
 * ones included; `setLinkTarget('external-only')` keeps a same-site link in the page, exactly as
 * the sanitizer has always written it.
 */

afterEach(() => { vi.unstubAllGlobals(); });

const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';

/** What a browser builds from an answer: two spellings of one tree read the same. */
const built = (html: string): string => new DOMParser().parseFromString(html, 'text/html').body.innerHTML;

/** The answer with no DOM at all, as a server render gets it: no DOMParser, no document. */
function withoutDom(config: AparteConfig, html: string): string {
    vi.stubGlobal('DOMParser', undefined);
    vi.stubGlobal('document', undefined);
    try { return config.sanitizeHtml(html); } finally { vi.unstubAllGlobals(); }
}

function externalOnly(): AparteConfig {
    const config = new AparteConfig();
    config.setLinkTarget('external-only');
    return config;
}

/** Every link spelling the sanitizer's own suite pins, with the target a model may ask for. */
const LINKS = [
    '<a href="/docs">x</a>',
    '<a href="./rel">x</a>',
    '<a href="?q=1">x</a>',
    '<a href="package.json">package.json</a>',
    '<a href="docs/setup.md" title="Setup">the setup</a>',
    '<a href="">here</a>',
    '<a href="#top">x</a>',
    '<a href="mailto:a@b.c">x</a>',
    '<a href="tel:+15550100">x</a>',
    '<a href="sms:+15550100">x</a>',
    '<a href="https://x.com">x</a>',
    '<a href="//attacker.example/phish">x</a>',
    '<a href=" https://evil.example">x</a>',
    '<a href="/\\evil.example">x</a>',
    '<a href="http:/evil.example">x</a>',
    '<a href="http:evil.example">x</a>',
    '<a href="https://x.com" target="_blank">x</a>',
    '<a href="https://x.com" target="_self">x</a>',
    '<a href="https://x.com" rel="opener">x</a>',
    '<a href="/docs" target="_self">x</a>',
    '<a href="/docs" target="_top">x</a>',
    '<a href="/docs" target="victimframe">x</a>',
    '<a href="/docs" target="_self" rel="opener noreferrer">x</a>',
    '<a href="#top" target="_self">x</a>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="javascript:alert(1)" target="_top">x</a>',
    '<h2>Title</h2><p>A <strong>bold</strong> <a href="https://x.com">link</a> and <code>x</code>.</p><ul><li>one</li></ul>',
    '<p>See <a href="src/parser.ts">the parser</a>, <a href="https://example.com/ref">the reference</a> and <a href="#steps">the steps</a>.</p>',
];

describe('by default, every link a reply holds opens in a new tab', () => {
    it('is the default', () => {
        expect(new AparteConfig().getLinkTarget()).toBe('new-tab');
    });

    it.each([
        '/docs', './rel', '?q=1', 'package.json', 'docs/setup.md', 'src/a.ts#L3', '',
        'https://x.com', '//x.example/p', `${location.origin}/account`,
    ])('opens %j in a new tab that cannot reach back', (href) => {
        const out = new AparteConfig().sanitizeHtml(`<a href="${href}">x</a>`);
        expect(out).toBe(`<a href="${href}" ${NEW_TAB}>x</a>`);
    });

    it('does not let the model keep a same-site link in the page, nor send it anywhere else', () => {
        const config = new AparteConfig();
        for (const wish of ['_self', '_top', '_parent', 'victimframe', '_SELF']) {
            expect(config.sanitizeHtml(`<a href="/docs" target="${wish}">x</a>`), wish).toBe(`<a href="/docs" ${NEW_TAB}>x</a>`);
        }
        expect(config.sanitizeHtml('<a href="/docs" target="_self" rel="opener">x</a>')).toBe(`<a href="/docs" ${NEW_TAB}>x</a>`);
    });

    it('leaves a link that stays in the page or hands over to another app as written', () => {
        const config = new AparteConfig();
        for (const href of ['#top', 'mailto:a@b.c', 'tel:+15550100', 'sms:+15550100', ' #top', 'MAILTO:A@B.C']) {
            const html = `<a href="${href}">x</a>`;
            expect(config.sanitizeHtml(html), href).toBe(defaultSanitizer(html));
            expect(config.sanitizeHtml(html), href).not.toContain('target=');
        }
    });

    it('keeps the attributes the link had, in their order', () => {
        expect(new AparteConfig().sanitizeHtml('<a href="docs/setup.md" title="Setup" class="file">the setup</a>'))
            .toBe(`<a href="docs/setup.md" title="Setup" class="file" ${NEW_TAB}>the setup</a>`);
    });

    it('still drops an unsafe address, and gives what is left no target of its own', () => {
        const config = new AparteConfig();
        for (const html of ['<a href="javascript:alert(1)">x</a>', '<a href="vbscript:msgbox(1)">x</a>', '<a href="data:text/html,<b>x</b>">x</a>', '<a href="java\tscript:alert(1)">x</a>']) {
            const out = config.sanitizeHtml(html);
            expect(out, html).not.toMatch(/script:|data:/i);
            expect(out, html).not.toContain('href=');
            expect(out, html).not.toContain('target=');
        }
    });

    it('comes out the same from a second pass', () => {
        const config = new AparteConfig();
        for (const html of LINKS) {
            const once = config.sanitizeHtml(html);
            expect(config.sanitizeHtml(once), html).toBe(once);
        }
    });
});

describe("setLinkTarget('external-only')", () => {
    it.each(LINKS)('gives exactly what the sanitizer has always given for %s', (html) => {
        expect(externalOnly().sanitizeHtml(html)).toBe(defaultSanitizer(html));
    });

    it('keeps a same-site link in the page and sends another site to a new tab', () => {
        const config = externalOnly();
        expect(config.sanitizeHtml('<a href="package.json">x</a>')).toBe('<a href="package.json">x</a>');
        expect(config.sanitizeHtml('<a href="https://x.com">x</a>')).toBe(`<a href="https://x.com" ${NEW_TAB}>x</a>`);
    });
});

describe('the rule holds whichever sanitizer is set', () => {
    // `setHtmlSanitizer` REPLACES the built-in sanitizer, chat rules included: DOMPurify alone
    // drops `target`, so an external link would navigate the chat's own frame.
    const raw = (html: string) => html;

    it('a replaced sanitizer still opens every link in a new tab, and cannot let the model choose', () => {
        const config = new AparteConfig();
        config.setHtmlSanitizer(raw);
        expect(config.sanitizeHtml('<a href="/docs">x</a>')).toBe(`<a href="/docs" ${NEW_TAB}>x</a>`);
        expect(config.sanitizeHtml('<a target="_top" href="/docs" title="t">x</a>')).toBe(`<a href="/docs" title="t" ${NEW_TAB}>x</a>`);
        expect(config.sanitizeHtml('<a href="#top">x</a>')).toBe('<a href="#top">x</a>');
    });

    it("under 'external-only', the sanitizer's own clamp comes back on top of a replaced one", () => {
        const config = externalOnly();
        config.setHtmlSanitizer(raw);
        expect(config.sanitizeHtml('<a href="https://x.com">x</a>')).toBe(`<a href="https://x.com" ${NEW_TAB}>x</a>`);
        expect(config.sanitizeHtml('<a href="/docs" target="_top">x</a>')).toBe(`<a href="/docs" ${NEW_TAB}>x</a>`);
        expect(config.sanitizeHtml('<a href="/docs" target="_self">x</a>')).toBe('<a href="/docs" target="_self">x</a>');
        // A link that stays in the page keeps the `rel` a sanitizer wrote: only a new tab rewrites it.
        expect(config.sanitizeHtml('<a href="/docs" rel="opener">x</a>')).toBe('<a href="/docs" rel="opener">x</a>');
        expect(config.sanitizeHtml('<a href="/docs">x</a>')).toBe('<a href="/docs">x</a>');
    });

    it('with sanitization disabled too', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = new AparteConfig();
        config.setHtmlSanitizer(null);
        expect(config.sanitizeHtml('<a href="package.json">x</a>')).toBe(`<a href="package.json" ${NEW_TAB}>x</a>`);
        warn.mockRestore();
    });
});

describe('the rel a custom sanitizer wrote', () => {
    const raw = (html: string) => html;
    const rels = (out: string): string[] => (/rel="([^"]*)"/.exec(out)?.[1] ?? '').split(' ').filter(Boolean).sort();

    function custom(mode: 'new-tab' | 'external-only'): AparteConfig {
        const config = new AparteConfig();
        config.setLinkTarget(mode);
        config.setHtmlSanitizer(raw);
        return config;
    }

    it('is kept when the link opens in a new tab, with noopener and noreferrer added', () => {
        const out = custom('new-tab').sanitizeHtml('<a href="https://x.com" rel="nofollow ugc">x</a>');
        expect(rels(out)).toEqual(['nofollow', 'noopener', 'noreferrer', 'ugc']);
        expect(out).toContain('target="_blank"');
    });

    it('is kept in external-only too, for another site', () => {
        const out = custom('external-only').sanitizeHtml('<a href="https://x.com" rel="nofollow">x</a>');
        expect(rels(out)).toEqual(['nofollow', 'noopener', 'noreferrer']);
    });

    it('loses an opener token, which would contradict noopener', () => {
        expect(rels(custom('new-tab').sanitizeHtml('<a href="/docs" rel="opener">x</a>'))).toEqual(['noopener', 'noreferrer']);
        expect(rels(custom('new-tab').sanitizeHtml('<a href="/docs" rel="Opener nofollow">x</a>'))).toEqual(['nofollow', 'noopener', 'noreferrer']);
    });

    it('is not touched on a link that stays in the page', () => {
        const external = custom('external-only');
        expect(external.sanitizeHtml('<a href="/docs" rel="nofollow">x</a>')).toBe('<a href="/docs" rel="nofollow">x</a>');
        for (const href of ['#top', 'mailto:a@b.c', 'tel:+15550100', 'sms:+15550100']) {
            expect(custom('new-tab').sanitizeHtml(`<a href="${href}" rel="nofollow">x</a>`), href).toBe(`<a href="${href}" rel="nofollow">x</a>`);
        }
    });

    it.each([
        ['new-tab', '<a href="https://x.com" rel="nofollow ugc">x</a>'],
        ['new-tab', '<a href="/docs" rel="opener">x</a>'],
        ['new-tab', '<a href="/docs" target="_top" rel="nofollow">x</a>'],
        ['new-tab', '<a href="https://x.com" rel="noreferrer noopener">x</a>'],
        ['new-tab', '<a href="#top" rel="nofollow">x</a>'],
        ['external-only', '<a href="/docs" rel="nofollow">x</a>'],
        ['external-only', '<a href="/docs" target="_self" rel="nofollow">x</a>'],
        ['external-only', '<a href="https://x.com" rel="nofollow" title="t">x</a>'],
    ] as const)('comes out the same with no DOM: %s %s', (mode, html) => {
        const config = custom(mode);
        expect(built(withoutDom(config, html))).toBe(built(config.sanitizeHtml(html)));
    });
});

describe('with no DOM, a link opens where it opens in a browser', () => {
    it.each(LINKS)('agrees with the browser on %s, in both modes', (html) => {
        for (const config of [new AparteConfig(), externalOnly()]) {
            expect(built(withoutDom(config, html)), `${config.getLinkTarget()}: ${html}`).toBe(built(config.sanitizeHtml(html)));
        }
    });

    it('reads a link inside a comment or a raw-text element as the text it is', () => {
        const html = '<!-- <a href="/x"> --><textarea><a href="/y"></textarea><a href="/z">z</a>';
        const out = applyLinkTargetWithoutDom(html, 'new-tab');
        expect(out).toBe(`<!-- <a href="/x"> --><textarea><a href="/y"></textarea><a href="/z" ${NEW_TAB}>z</a>`);
    });

    it('writes back only the tags it changes', () => {
        const html = '<p title=\'it\'s\'>a <a href=\'https://x.com\' target=_blank rel="noopener noreferrer">x</a></p>';
        expect(applyLinkTargetWithoutDom(html, 'external-only')).toBe(html);
    });

    it('stays linear on a long source', () => {
        const started = performance.now();
        applyLinkTargetWithoutDom('<a href="/x">x</a>'.repeat(20_000), 'new-tab');
        applyLinkTargetWithoutDom('<a '.repeat(30_000), 'new-tab');
        applyLinkTargetWithoutDom('<!--'.repeat(20_000), 'new-tab');
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe('decideLink', () => {
    it('answers what a link drawn by hand needs: a new tab, or nothing', () => {
        const config = new AparteConfig();
        expect(config.decideLink('package.json')).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
        expect(config.decideLink('https://x.com')).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
        for (const href of ['#steps', 'mailto:a@b.c', 'tel:+15550100', 'sms:+15550100']) expect(config.decideLink(href), href).toEqual({});
    });

    it("keeps a same-site link in the page under 'external-only', and counts every spelling of another site as one", () => {
        const config = externalOnly();
        expect(config.decideLink('package.json')).toEqual({});
        expect(config.decideLink('/docs')).toEqual({});
        for (const href of ['https://x.com', '//x.example', ' https://evil.example', '/\\evil.example', 'http:/evil.example', 'http:evil.example']) {
            expect(config.decideLink(href), href).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
        }
    });

    it('is what the pass writes', () => {
        for (const config of [new AparteConfig(), externalOnly()]) {
            for (const href of ['/docs', 'package.json', '#top', 'mailto:a@b.c', 'https://x.com', '//x.example']) {
                const anchor = new DOMParser().parseFromString(config.sanitizeHtml(`<a href="${href}">x</a>`), 'text/html').querySelector('a')!;
                const drawn: Record<string, string> = {};
                for (const name of ['target', 'rel']) if (anchor.hasAttribute(name)) drawn[name] = anchor.getAttribute(name)!;
                expect(drawn, `${config.getLinkTarget()}: ${href}`).toEqual(config.decideLink(href));
            }
        }
    });
});

describe('setLinkTarget', () => {
    it('redraws what is on screen, and not when it is told the same mode again', () => {
        const config = new AparteConfig();
        const listener = vi.fn();
        config.subscribe(listener);
        const version = renderingVersionOf(config);
        config.setLinkTarget('new-tab');
        expect(listener).not.toHaveBeenCalled();
        expect(renderingVersionOf(config)).toBe(version);
        config.setLinkTarget('external-only');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(renderingVersionOf(config)).toBeGreaterThan(version);
        config.setLinkTarget('external-only');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('goes back to a new tab on reset', () => {
        const config = externalOnly();
        config.reset();
        expect(config.getLinkTarget()).toBe('new-tab');
    });
});
