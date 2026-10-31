import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupLinkCard, linkCard, readLinks, type LinkCardOptions } from './index.js';

const ARTICLE = {
    url: 'https://www.example.com/blog/how-we-ship',
    title: 'How we ship on Fridays',
    description: 'Small batches, a green gate, and nobody on call at the weekend.',
    image: 'https://cdn.example.com/og/ship.png',
    siteName: 'Example Blog',
    favicon: 'https://www.example.com/favicon.png',
    author: 'Ann Lee',
    publishedAt: '2024-03-03T12:00:00Z',
    type: 'article',
};
const REPO = { url: 'https://github.com/apartejs/aparte' };
const VIDEO = { url: 'https://www.youtube.com/watch?v=abc', title: 'The talk', image: 'https://i.example/abc.jpg' };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    stop = () => {};
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { url: 'https://www.example.com/blog/how-we-ship' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'unfurl', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function setup(options: LinkCardOptions = {}): void {
    stop = setupLinkCard({ tool: 'unfurl', ...options });
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = aparteGlobalConfig.getToolRenderer('unfurl')!.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);

describe('the link card on a tool', () => {
    beforeEach(() => setup());

    it('draws one page as a card: its picture, site line, title and description — one link', () => {
        const card = draw(call('resolved', ARTICLE));
        expect(card.dataset.card).toBe('link');
        expect(card.dataset.variant).toBe('card');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('How we ship on Fridays');
        const article = card.querySelector('article.aparte-link-preview--card')!;
        expect(article.getAttribute('data-type')).toBe('article');
        const links = card.querySelectorAll('a');
        expect(links).toHaveLength(1);
        const link = links[0]!;
        expect(link.textContent).toBe('How we ship on Fridays');
        expect(link.getAttribute('href')).toBe('https://www.example.com/blog/how-we-ship');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        const img = card.querySelector('.aparte-link-preview__media img')!;
        expect(img.getAttribute('src')).toBe('https://cdn.example.com/og/ship.png');
        expect(img.getAttribute('alt')).toBe('');
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('decoding')).toBe('async');
        expect(text(card, '.aparte-link-preview__site-name')).toBe('Example Blog');
        expect(text(card, '.aparte-link-preview__author')).toBe('Ann Lee');
        const date = card.querySelector('time')!;
        expect(date.textContent).toBe('Mar 3, 2024');
        expect(date.getAttribute('datetime')).toBe('2024-03-03T12:00:00.000Z');
        expect(text(card, '.aparte-link-preview__description')).toBe(ARTICLE.description);
        expect(text(card, '.aparte-link-preview__type')).toBe('Article');
        const icon = card.querySelector('.aparte-link-preview__icon')!;
        expect(icon.getAttribute('aria-hidden')).toBe('true');
        expect(icon.querySelector('img')!.getAttribute('src')).toBe('https://www.example.com/favicon.png');
        expect(text(icon, '.aparte-link-preview__initial')).toBe('E');
    });

    it('falls back to the host for the title and the site, and fetches no icon it was not given', () => {
        const card = draw(call('resolved', REPO));
        expect(card.getAttribute('aria-label')).toBe('github.com');
        expect(text(card, 'a')).toBe('github.com');
        expect(text(card, '.aparte-link-preview__site-name')).toBe('github.com');
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('.aparte-link-preview__media')).toBeNull();
        expect(text(card, '.aparte-link-preview__initial')).toBe('G');
        expect(text(card, '.aparte-link-preview__type')).toBe('Repository');
        expect(card.querySelector('time')).toBeNull();
    });

    it('marks a video page with the play disc', () => {
        const card = draw(call('resolved', VIDEO));
        expect(card.querySelector('.aparte-link-preview__media .aparte-link-preview__play')).not.toBeNull();
        expect(text(card, '.aparte-link-preview__type')).toBe('Video');
    });

    it('shows a skeleton with what the input already says, in the shape of each variant', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('example.com — Loading');
        expect(text(card, '.aparte-link-preview__site-name')).toBe('example.com');
        expect(card.querySelector('.aparte-link-preview__sk-title')).not.toBeNull();
        expect(card.querySelector('.aparte-link-preview__sk-media')).not.toBeNull();
        const search = draw(call('pending', undefined, { query: 'aparte chat' }));
        expect(search.getAttribute('aria-label')).toBe('aparte chat — Loading');
        expect(text(search, '.aparte-link-preview__title')).toBe('aparte chat');
        expect(search.querySelector('.aparte-link-preview__sk-site')).not.toBeNull();
        const blind = draw(call('pending', undefined, {}));
        expect(blind.getAttribute('aria-label')).toBe('Link — Loading');
        expect(blind.querySelector('.aparte-link-preview__sk-title')).not.toBeNull();
        stop();
        setup({ variant: 'compact' });
        expect(draw(call('pending')).querySelector('.aparte-link-preview--row .aparte-link-preview__sk-mark')).not.toBeNull();
        expect(text(draw(call('pending')), '.aparte-link-preview__meta')).toBe('example.com');
        expect(draw(call('pending', undefined, {})).querySelectorAll('.aparte-link-preview__sk-site')).toHaveLength(1);
        stop();
        setup({ variant: 'quote' });
        expect(draw(call('pending')).querySelector('.aparte-link-preview--quote .aparte-link-preview__quote-text')).not.toBeNull();
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-link-preview')).toBeNull();
        expect(text(failed, '.aparte-rich-card__strip-title')).toBe('example.com');
    });

    it('says it is unavailable, and warns once, when the result holds no link', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { results: [{ title: 'No address' }] }));
        draw(call('resolved', []));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('unfurl')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', ARTICLE));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(text(card, 'a')).toBe('How we ship on Fridays');
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', ARTICLE));
        expect(text(card, 'time')).toBe('3 mars 2024');
    });

    it('relabels in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('unfurl')!;
        for (const variant of ['card', 'compact', 'quote'] as const) {
            stop();
            setup({ variant });
            const data = variant === 'card' ? ARTICLE : [ARTICLE, REPO];
            const card = draw(call('resolved', data));
            const count = card.querySelectorAll('*').length;
            aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
            renderer.relabel!(card, call('resolved', data));
            expect(card.querySelectorAll('*').length).toBe(count);
            expect(text(card, 'time')).toBe('3 mars 2024');
            if (variant === 'card') expect(text(card, '.aparte-link-preview__type')).toBe('Article');
            if (variant === 'compact') {
                expect(card.getAttribute('aria-label')).toBe('2 liens');
                expect(text(card, '.aparte-link-preview__heading-text')).toBe('2 liens');
                expect(card.querySelectorAll('.aparte-link-preview__corner')[1]!.getAttribute('aria-label')).toBe('Dépôt');
            }
            if (variant === 'quote') {
                expect(card.querySelector('.aparte-link-preview__stack')!.getAttribute('aria-label')).toBe('2 liens');
                expect(texts(card, '.aparte-link-preview__type')).toEqual(['Article', 'Dépôt']);
            }
            aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        }
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsLinkRepo: 'Code source', cardsLinkCount: '{n} pages' });
        expect(text(draw(call('resolved', REPO)), '.aparte-link-preview__type')).toBe('Code source');
        expect(draw(call('resolved', [REPO, ARTICLE])).getAttribute('aria-label')).toBe('2 pages');
    });

    it('never parses a value from the tool as markup, and opens or loads nothing it should not', () => {
        const evil = '<img src=x onerror="window.__pwned=1">';
        const card = draw(call('resolved', {
            url: 'https://ok.example/', title: evil, description: evil, siteName: evil, author: evil,
            image: 'javascript:alert(1)', favicon: 'data:image/png;base64,AAAA', themeColor: 'red; background: url(https://x.example/t)',
        }));
        expect(card.querySelectorAll('img')).toHaveLength(0);
        expect(text(card, 'a')).toBe(evil);
        expect(text(card, '.aparte-link-preview__description')).toBe(evil);
        expect(text(card, '.aparte-link-preview__site-name')).toBe(evil);
        expect(text(card, '.aparte-link-preview__initial')).toBe('<');
        expect((window as any).__pwned).toBeUndefined();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const bad = draw(call('resolved', { url: 'javascript:alert(1)', title: 'x' }));
        expect(bad.dataset.state).toBe('unavailable');
        expect(bad.querySelector('a')).toBeNull();
        warn.mockRestore();
        stop();
        setup({ variant: 'quote' });
        const quote = draw(call('resolved', { url: 'https://ok.example/', themeColor: 'red; background: url(https://x.example/t)' }));
        expect(quote.querySelector<HTMLElement>('.aparte-link-preview--quote')!.style.getPropertyValue('--aparte-link-preview-accent')).toBe('');
    });

    it('drops a picture that fails to load, and an icon that fails falls back to the initial', () => {
        const card = draw(call('resolved', ARTICLE));
        card.querySelector('.aparte-link-preview__media img')!.dispatchEvent(new Event('error'));
        expect(card.querySelector('.aparte-link-preview__media')).toBeNull();
        const icon = card.querySelector('.aparte-link-preview__icon')!;
        expect(icon.hasAttribute('data-favicon')).toBe(true);
        icon.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(icon.querySelector('img')).toBeNull();
        expect(icon.hasAttribute('data-favicon')).toBe(false);
        expect(text(icon, '.aparte-link-preview__initial')).toBe('E');
        const loaded = draw(call('resolved', ARTICLE));
        loaded.querySelector('.aparte-link-preview__media img')!.dispatchEvent(new Event('load'));
        expect(loaded.querySelector('.aparte-link-preview__media')!.hasAttribute('data-loading')).toBe(false);
    });
});

describe('variants', () => {
    it('draws one link as a row in compact: its mark with its kind in the corner, the title, the site, a small picture', () => {
        setup({ variant: 'compact' });
        const card = draw(call('resolved', ARTICLE));
        const row = card.querySelector(':scope > div.aparte-link-preview--row')!;
        expect(row).not.toBeNull();
        expect(row.querySelector('.aparte-link-preview__icon--lg')).not.toBeNull();
        const corner = row.querySelector('.aparte-link-preview__corner')!;
        expect(corner.getAttribute('role')).toBe('img');
        expect(corner.getAttribute('aria-label')).toBe('Article');
        expect(text(row, '.aparte-link-preview__title')).toBe('How we ship on Fridays');
        expect(texts(row, '.aparte-link-preview__meta > :not(.aparte-link-preview__dot)')).toEqual(['Example Blog', 'Mar 3, 2024']);
        expect(row.querySelector('.aparte-link-preview__thumb img')).not.toBeNull();
        expect(row.querySelector('.aparte-link-preview__description')).toBeNull();
        expect(draw(call('resolved', { url: 'https://plain.example/' })).querySelector('.aparte-link-preview__corner')).toBeNull();
    });

    it('stacks several links as compact rows in card too, under a heading', () => {
        setup();
        const card = draw(call('resolved', { title: 'Sources', links: [ARTICLE, REPO, VIDEO] }));
        expect(card.getAttribute('aria-label')).toBe('Sources');
        expect(text(card, '.aparte-link-preview__heading-text')).toBe('Sources');
        const list = card.querySelector('ul.aparte-link-preview__list')!;
        expect(list.getAttribute('aria-label')).toBe('Sources');
        expect(list.querySelectorAll(':scope > li.aparte-link-preview--row')).toHaveLength(3);
        expect(card.querySelector('.aparte-link-preview--card')).toBeNull();
        expect(card.querySelectorAll('a')).toHaveLength(3);
    });

    it('draws a quote with a coloured rule: the page’s own colour, else its host’s hue', () => {
        setup({ variant: 'quote' });
        const card = draw(call('resolved', { ...ARTICLE, themeColor: '#ff5500' }));
        const quote = card.querySelector<HTMLElement>(':scope > div.aparte-link-preview--quote')!;
        expect(quote.style.getPropertyValue('--aparte-link-preview-accent')).toBe('#ff5500');
        expect(quote.getAttribute('data-hue')).toMatch(/^[0-5]$/);
        expect(text(quote, '.aparte-link-preview__quote-text .aparte-link-preview__site-name')).toBe('Example Blog');
        expect(texts(quote, '.aparte-link-preview__byline > :not(.aparte-link-preview__dot)')).toEqual(['Ann Lee', 'Mar 3, 2024']);
        expect(quote.querySelector('.aparte-link-preview__quote-media img')).not.toBeNull();
        expect(quote.querySelectorAll('a')).toHaveLength(1);
        const many = draw(call('resolved', [ARTICLE, REPO]));
        expect(many.querySelectorAll('ul.aparte-link-preview__stack > li.aparte-link-preview--quote')).toHaveLength(2);
        // The same host gets the same hue, wherever it is drawn.
        const again = draw(call('resolved', { url: 'https://www.example.com/other' }));
        expect(again.querySelector('.aparte-link-preview--quote')!.getAttribute('data-hue')).toBe(quote.getAttribute('data-hue'));
    });

    it('picks a variant per result, and reads an unknown name as the default', () => {
        setup({ variant: (d) => (d.links.length > 1 ? 'quote' : 'compact') });
        expect(draw(call('resolved', ARTICLE)).dataset.variant).toBe('compact');
        expect(draw(call('resolved', [ARTICLE, REPO])).dataset.variant).toBe('quote');
        stop();
        setup({ variant: 'nope' as never });
        expect(draw(call('resolved', ARTICLE)).dataset.variant).toBe('card');
    });

    it('draws ten links at most, and names a collection by its count', () => {
        setup();
        const card = draw(call('resolved', Array.from({ length: 14 }, (_, i) => `https://site${i}.example/`)));
        expect(card.querySelectorAll('.aparte-link-preview--row')).toHaveLength(10);
        expect(card.getAttribute('aria-label')).toBe('10 links');
    });
});

describe('the link card as a segment', () => {
    it('draws a card segment, and its fallback sentence says the same', () => {
        stop = setupLinkCard();
        const segment = linkCard.segment([ARTICLE, REPO], { variant: 'quote' });
        expect(segment.fallback).toBe('How we ship on Fridays — Example Blog (https://www.example.com/blog/how-we-ship)\ngithub.com — github.com (https://github.com/apartejs/aparte)');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('link');
        expect(out.dataset.variant).toBe('quote');
        expect(out.querySelectorAll('li.aparte-link-preview--quote')).toHaveLength(2);
        expect(linkCard.segment({ title: 'Read more', links: [REPO] }).fallback).toBe('Read more:\ngithub.com — github.com (https://github.com/apartejs/aparte)');
        expect(linkCard.segment({ nothing: true }).fallback).toBeUndefined();
    });
});

describe('reading the data', () => {
    it('reads Open Graph and Twitter keys, flat', () => {
        const link = readLinks({
            'og:url': 'https://news.example/a', 'og:title': 'Headline', 'og:description': 'Lede', 'og:site_name': 'The News',
            'og:type': 'article', 'twitter:image': 'https://img.example/t.jpg', 'article:published_time': '2026-10-01T08:00:00Z',
            'article:author': 'R. Porter', 'theme-color': '#123',
        })!.links[0]!;
        expect(link).toMatchObject({
            url: 'https://news.example/a', host: 'news.example', title: 'Headline', description: 'Lede', siteName: 'The News',
            type: 'article', image: 'https://img.example/t.jpg', author: 'R. Porter', themeColor: '#123',
        });
        expect(link.publishedAt!.toISOString()).toBe('2026-10-01T08:00:00.000Z');
        expect(readLinks({ url: 'https://a.example', 'og:image': { url: 'https://a.example/i.png' } })!.links[0]!.image).toBe('https://a.example/i.png');
    });

    it("reads an unfurler's nested shapes", () => {
        const unfurl = readLinks({
            url: 'https://blog.example/p',
            meta: { title: 'Meta title', description: 'Meta words' },
            open_graph: { title: 'OG title', site_name: 'Blog', images: [{ url: 'https://blog.example/og.jpg' }], type: 'video.other', article: { published_time: '2025-01-02' } },
            twitter_card: { images: [{ url: 'https://blog.example/tw.jpg' }] },
            favicon: 'https://blog.example/fav.ico',
        })!.links[0]!;
        expect(unfurl).toMatchObject({ title: 'OG title', description: 'Meta words', siteName: 'Blog', image: 'https://blog.example/og.jpg', type: 'video', favicon: 'https://blog.example/fav.ico' });
        expect(unfurl.publishedAt!.getFullYear()).toBe(2025);
        const ogs = readLinks({ ogUrl: 'https://s.example/', ogTitle: 'Scraped', ogImage: [{ url: 'https://s.example/i.png' }], ogSiteName: 'S', ogType: 'product' })!.links[0]!;
        expect(ogs).toMatchObject({ url: 'https://s.example/', title: 'Scraped', image: 'https://s.example/i.png', siteName: 'S', type: 'product' });
        const tw = readLinks({ url: 'https://t.example/', twitter: { title: 'Tw', image: 'https://t.example/i.png' } })!.links[0]!;
        expect(tw).toMatchObject({ title: 'Tw', image: 'https://t.example/i.png' });
    });

    it('reads the search results of Google, SerpAPI, Brave, Tavily and Exa', () => {
        const google = readLinks({ kind: 'customsearch#search', items: [{
            link: 'https://docs.example/guide', title: 'Guide', snippet: 'How to\n  start.', displayLink: 'docs.example',
            pagemap: { cse_image: [{ src: 'https://docs.example/cse.png' }], metatags: [{ 'og:site_name': 'Docs', 'theme-color': '#0a0' }] },
        }] })!.links[0]!;
        expect(google).toMatchObject({ url: 'https://docs.example/guide', title: 'Guide', description: 'How to start.', image: 'https://docs.example/cse.png', siteName: 'Docs', themeColor: '#0a0' });
        const serp = readLinks({ organic_results: [{ link: 'https://s.example/r', title: 'R', snippet: 'S', source: 'Serp Site', favicon: 'https://s.example/f.png', thumbnail: 'https://s.example/t.png', date: 'Mar 3, 2024' }] })!.links[0]!;
        expect(serp).toMatchObject({ siteName: 'Serp Site', favicon: 'https://s.example/f.png', image: 'https://s.example/t.png' });
        expect(serp.publishedAt!.getFullYear()).toBe(2024);
        const brave = readLinks({ web: { results: [{ url: 'https://b.example/', title: 'B', description: 'D', profile: { name: 'Brave Site', img: 'https://imgs.example/p.png' }, meta_url: { favicon: 'https://imgs.example/f.png' }, thumbnail: { src: 'https://imgs.example/t.jpg' }, age: '2 days ago' }] } })!.links[0]!;
        expect(brave).toMatchObject({ siteName: 'Brave Site', favicon: 'https://imgs.example/f.png', image: 'https://imgs.example/t.jpg', publishedAt: undefined });
        const tavily = readLinks({ query: 'q', results: [{ url: 'https://t.example/', title: 'T', content: 'C', published_date: '2026-09-09' }] })!.links[0]!;
        expect(tavily).toMatchObject({ description: 'C' });
        expect(tavily.publishedAt!.getMonth()).toBe(8);
        const exa = readLinks({ results: [{ url: 'https://e.example/', title: 'E', author: ['Ann', 'Bo'], publishedDate: 1_700_000_000, image: 'https://e.example/i.png', favicon: 'https://e.example/f.ico' }] })!.links[0]!;
        expect(exa).toMatchObject({ author: 'Ann', favicon: 'https://e.example/f.ico' });
        expect(exa.publishedAt!.getFullYear()).toBe(2023);
        expect(readLinks({ displayLink: 'www.bare.example', title: 'Only a display link' })!.links[0]!.url).toBe('https://www.bare.example/');
    });

    it('reads the kind of page from its type, else from its host', () => {
        const type = (raw: object) => readLinks(raw)!.links[0]!.type;
        expect(type({ url: 'https://github.com/a/b' })).toBe('repo');
        expect(type({ url: 'https://gitlab.com/a/b/-/tree/main' })).toBe('repo');
        expect(type({ url: 'https://github.com/features' })).toBe('website');
        expect(type({ url: 'https://youtu.be/x' })).toBe('video');
        expect(type({ url: 'https://m.youtube.com/watch?v=1' })).toBe('video');
        expect(type({ url: 'https://news.example/', type: 'NewsArticle' })).toBe('article');
        expect(type({ url: 'https://shop.example/', 'og:type': 'product.item' })).toBe('product');
        expect(type({ url: 'https://code.example/', kind: 'software' })).toBe('repo');
        expect(type({ url: 'https://github.com/a/b', type: 'website' })).toBe('website');
        expect(type({ url: 'https://x.example/', type: 'object' })).toBe('website');
    });

    it('keeps only what it can trust', () => {
        const one = (raw: object) => readLinks(raw)!.links[0]!;
        expect(one({ url: 'https://a.example/', publishedAt: 2024 }).publishedAt).toBeUndefined();
        expect(one({ url: 'https://a.example/', date: 'yesterday' }).publishedAt).toBeUndefined();
        expect(one({ url: 'https://a.example/', date: new Date('nope') }).publishedAt).toBeUndefined();
        expect(one({ url: 'https://a.example/', date: new Date(2020, 0, 2) }).publishedAt!.getFullYear()).toBe(2020);
        expect(one({ url: 'https://a.example/', themeColor: '#12' }).themeColor).toBeUndefined();
        expect(one({ url: 'https://a.example/', image: 'img/relative.png' }).image).toBeUndefined();
        expect(one({ url: 'https://a.example/', image: '//cdn.example/x.png' }).image).toBe('https://cdn.example/x.png');
        expect(one({ url: 'https://a.example/', description: 'x'.repeat(900) }).description).toHaveLength(400);
        expect(one({ url: 'https://a.example/', author: { name: 'Org' } }).author).toBe('Org');
        expect(readLinks('https://only.example/x')!.links[0]!.host).toBe('only.example');
        expect(readLinks(['https://a.example/', 'not a url', 7, null])!.links).toHaveLength(1);
        expect(readLinks({ title: 'Not a collection', url: 'https://a.example/' })!.title).toBeUndefined();
        expect(readLinks(null)).toBeNull();
        expect(readLinks(5)).toBeNull();
        expect(readLinks({ links: [] })).toBeNull();
        expect(readLinks({ url: 'ftp://a.example/' })).toBeNull();
    });
});

describe('what the audit found', () => {
    beforeEach(() => setup());

    it("reads Brave's highlighted snippets as text: its <strong> tags dropped, its entities decoded, nothing parsed", () => {
        // As Brave's web search writes a result (2026-10): the query's words wrapped in <strong>.
        const brave = { web: { results: [{
            url: 'https://doc.rust-lang.org/book/', title: 'The <strong>Rust</strong> Programming Language',
            description: 'Learn <strong>Rust</strong> &amp; its tools — &#39;the book&#39; &lt;3 &quot;ownership&quot; &#x27;x&#x27;',
        }] } };
        const [link] = readLinks(brave)!.links;
        expect(link!.title).toBe('The Rust Programming Language');
        expect(link!.description).toBe('Learn Rust & its tools — \'the book\' <3 "ownership" \'x\'');
        const card = draw(call('resolved', brave));
        expect(card.querySelector('strong')).toBeNull();
        expect(text(card, '.aparte-link-preview__description')).toBe(link!.description);
        // An encoded tag is decoded once, to text — never decoded and then stripped, never parsed.
        expect(readLinks({ url: 'https://x.example/', description: '&lt;strong&gt;x&lt;/strong&gt;' })!.links[0]!.description).toBe('<strong>x</strong>');
        // A title that names a tag, not one that wears it, keeps it.
        expect(readLinks({ url: 'https://x.example/', title: 'Why <div> is not a button' })!.links[0]!.title).toBe('Why <div> is not a button');
    });
});
