import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteToolCallSegment } from '@aparte/core';
import { setupItemsCard } from '../items/index.js';
import { setupLinkCard } from '../link/index.js';
import { setupMediaCard } from '../media/index.js';
import { setupOrderCard } from '../order/index.js';
import { setupPlaceCard } from '../place/index.js';
import { setupProductCard } from '../product/index.js';
import { setupScoreCard } from '../score/index.js';
import { defineCard } from './define.js';
import { el } from './dom.js';
import { setupCardFences } from './fence.js';

// The image policy holds every address but a data: one until the reader chooses. A card
// draws what it draws without the picture, and says so in one button.

const stops: Array<() => void> = [];
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const REMOTE = 'img[src^="http"], video[src], video[poster], audio[src], source[src]';
const BUTTON = '.aparte-rich-card__images-show';
const HOSTS = '.aparte-rich-card__images-hosts';

function drawn(setup: () => () => void, tool: string, data: unknown): HTMLElement {
    stops.push(setup());
    const segment: AparteToolCallSegment = {
        id: 's1', type: 'tool_call', status: 'resolved',
        toolCall: { id: 'c1', name: tool, input: {} },
        structuredResult: data, result: JSON.stringify(data),
    };
    const out = aparteGlobalConfig.getToolRenderer(tool)!.render(segment) as HTMLElement;
    document.body.append(out);
    return out;
}

// One card each: its tool result, the host the policy holds it from, and what the card
// shows meanwhile — the box it already draws for a picture that is missing or broken.
const CARDS: Array<{
    name: string;
    setup: () => () => void;
    data: unknown;
    hosts: string;
    without: (card: HTMLElement) => void;
}> = [
    {
        name: 'items', hosts: 'img.example',
        setup: () => setupItemsCard({ tool: 'items' }),
        data: { items: [{ title: 'Mont Veyrier', image: 'https://img.example/veyrier.jpg' }] },
        without: (card) => expect(card.querySelector('.aparte-items__media')!.hasAttribute('data-empty')).toBe(true),
    },
    {
        name: 'link', hosts: 'cdn.example, fav.example',
        setup: () => setupLinkCard({ tool: 'link' }),
        data: { url: 'https://news.example/a', title: 'A page', image: 'https://cdn.example/og.png', favicon: 'https://fav.example/f.png' },
        without: (card) => {
            // No picture, no box for it; no icon, the initial.
            expect(card.querySelector('.aparte-link-preview__media')).toBeNull();
            expect(card.querySelector('.aparte-link-preview__icon')!.hasAttribute('data-favicon')).toBe(false);
        },
    },
    {
        name: 'media (an image)', hosts: 'cdn.example',
        setup: () => setupMediaCard({ tool: 'media' }),
        data: { src: 'https://cdn.example/sunset.jpg', title: 'Sunset' },
        without: (card) => {
            expect(card.querySelector('.aparte-media__placeholder')).not.toBeNull();
            // Nothing is waiting for a load that will not come.
            expect(card.querySelector('[data-loading]')).toBeNull();
        },
    },
    {
        name: 'media (a video)', hosts: 'cdn.example',
        setup: () => setupMediaCard({ tool: 'media' }),
        data: { src: 'https://cdn.example/clip.mp4', poster: 'https://cdn.example/clip.jpg' },
        without: (card) => expect(card.querySelector('.aparte-media__frame--video .aparte-media__placeholder')).not.toBeNull(),
    },
    {
        name: 'media (a sound)', hosts: 'cdn.example',
        setup: () => setupMediaCard({ tool: 'media' }),
        data: { src: 'https://cdn.example/ep1.mp3', title: 'Episode 1', poster: 'https://cdn.example/cover.jpg' },
        without: (card) => {
            expect(card.querySelector('.aparte-media__cover .aparte-media__placeholder')).not.toBeNull();
            expect(card.querySelector('.aparte-media__audio-title')!.textContent).toBe('Episode 1');
        },
    },
    {
        name: 'order', hosts: 'cdn.example',
        setup: () => setupOrderCard({ tool: 'order' }),
        data: { reference: '1042', status: 'shipped', items: [{ title: 'Trail runner', image: 'https://cdn.example/shoe.jpg', quantity: 1, price: 89 }] },
        without: (card) => expect(card.querySelector('.aparte-order__thumb')!.hasAttribute('data-empty')).toBe(true),
    },
    {
        name: 'product', hosts: 'cdn.example',
        setup: () => setupProductCard({ tool: 'product' }),
        data: { title: 'Trail runner 3', price: 48, currency: 'EUR', merchant: 'Decathlon', merchantLogo: 'https://cdn.example/logo.png', image: 'https://cdn.example/shoe.jpg' },
        without: (card) => {
            expect(card.querySelector('.aparte-product__media')!.hasAttribute('data-empty')).toBe(true);
            expect(card.querySelector('.aparte-product__merchant-name')!.textContent).toBe('Decathlon');
        },
    },
    {
        name: 'place', hosts: 'example.com',
        setup: () => setupPlaceCard({ tool: 'place' }),
        data: { name: 'Trattoria Da Enzo', image: 'https://example.com/enzo.jpg' },
        without: (card) => expect(card.querySelector('.aparte-place__media')!.hasAttribute('data-empty')).toBe(true),
    },
    {
        name: 'score', hosts: 'example.com',
        setup: () => setupScoreCard({ tool: 'score' }),
        data: { home: { name: 'Lille', logo: 'https://example.com/lille.png', score: 2 }, away: { name: 'Lens', score: 1 }, status: 'final' },
        without: (card) => {
            // The monogram, with no logo to sit over it.
            expect(card.querySelector('.aparte-score__crest')!.hasAttribute('data-logo')).toBe(false);
            expect(card.querySelector('.aparte-score__monogram')).not.toBeNull();
        },
    },
];

describe('a card whose pictures the image policy holds', () => {
    it.each(CARDS)('$name draws no request, its no-picture state, and a "Show images" naming the host', ({ setup, data, hosts, without, name }) => {
        const card = drawn(setup, name.split(' ')[0]!, data);
        expect(card.dataset.state).toBe('ready');
        expect(card.querySelector(REMOTE)).toBeNull();
        without(card);
        const button = card.querySelector<HTMLButtonElement>(BUTTON)!;
        expect(button.textContent).toContain('Show images');
        expect(card.querySelector(HOSTS)!.textContent).toBe(hosts);
    });

    it.each(CARDS)('$name loads its pictures without a referrer once they are shown, and the button goes', ({ setup, data, name }) => {
        const card = drawn(setup, name.split(' ')[0]!, data);
        card.querySelector<HTMLButtonElement>(BUTTON)!.click();
        const loaded = [...card.querySelectorAll<HTMLElement>(REMOTE)];
        expect(loaded.length).toBeGreaterThan(0);
        for (const node of card.querySelectorAll('img[src^="http"]')) expect(node.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(card.querySelector(BUTTON)).toBeNull();
    });
});

describe('the "Show images" button', () => {
    const items = (...srcs: string[]) => ({ items: srcs.map((image, i) => ({ title: `Item ${i}`, image })) });
    const setup = () => setupItemsCard({ tool: 'items' });

    it('names every host, once each, sorted rather than in the order the data chose', () => {
        const one = drawn(setup, 'items', items('https://a.example/1.jpg', 'https://a.example/2.jpg'));
        expect(one.querySelector(HOSTS)!.textContent).toBe('a.example');
        document.body.innerHTML = '';
        // Trusted-looking hosts first, the one that matters last: none is left out.
        const four = drawn(setup, 'items', items('https://upload.wikimedia.org/1.jpg', 'https://images.unsplash.com/2.jpg', 'https://cdn.shop.example.attacker.example/3.jpg?d=secret', 'https://upload.wikimedia.org/4.jpg'));
        expect(four.querySelector(HOSTS)!.textContent).toBe('cdn.shop.example.attacker.example, images.unsplash.com, upload.wikimedia.org');
        expect(four.querySelector(BUTTON)!.getAttribute('aria-label')).toBe('Show images from cdn.shop.example.attacker.example, images.unsplash.com, upload.wikimedia.org');
    });

    it('shows the pictures on a click, and the config then says "load" for each', () => {
        const card = drawn(setup, 'items', items('https://a.example/1.jpg', 'https://b.example/2.jpg'));
        expect(aparteGlobalConfig.decideImage('https://a.example/1.jpg')).toBe('hold');
        card.querySelector<HTMLButtonElement>(BUTTON)!.click();
        expect([...card.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['https://a.example/1.jpg', 'https://b.example/2.jpg']);
        expect(aparteGlobalConfig.decideImage('https://a.example/1.jpg')).toBe('load');
        expect(aparteGlobalConfig.decideImage('https://b.example/2.jpg')).toBe('load');
        expect(card.querySelector(BUTTON)).toBeNull();
    });

    it('never appears for a data: picture, which loads at once', () => {
        // The shipped cards only read http(s) pictures, so a card of its own gives the helper one.
        const own = defineCard<{ src: string }, 'a'>({
            name: 'own', variants: ['a'], styles: '', icon: '<svg></svg>',
            normalize: (raw: any) => (typeof raw?.src === 'string' ? { src: raw.src } : null),
            render: (d, ctx) => [ctx.image(d.src, { class: 'pic' }) ?? el('span', { class: 'none' })],
            skeleton: () => [], label: () => 'Own', fallback: () => 'own',
        });
        const card = drawn(() => own.setup({ tool: 'own' }), 'own', { src: 'data:image/png;base64,AAAA' });
        expect(card.querySelector('img.pic')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        expect(card.querySelector('img.pic')!.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(card.querySelector(BUTTON)).toBeNull();
    });

    it('hands the focus to the card when it was pressed from the keyboard, not to the page', () => {
        const card = drawn(() => setupLinkCard({ tool: 'link' }), 'link',
            { url: 'https://news.example/a', title: 'A page', image: 'https://cdn.example/og.png' });
        const button = card.querySelector<HTMLButtonElement>(BUTTON)!;
        button.focus();
        button.click();
        expect(document.activeElement).not.toBe(document.body);
        expect(card.contains(document.activeElement)).toBe(true);
    });

    it('names a host only the lightbox would fetch from, before the lightbox ever opens', () => {
        // The tiles show each still from an allowed host; the full-size pictures are elsewhere.
        aparteGlobalConfig.setImagePolicy(['https://thumbs.example']);
        const gallery = {
            items: [1, 2, 3].map((n) => ({ src: `https://full.example/${n}.jpg`, poster: `https://thumbs.example/${n}.jpg`, title: `Shot ${n}` })),
        };
        const card = drawn(() => setupMediaCard({ tool: 'media', variant: 'gallery' }), 'media', gallery);
        expect(card.querySelector(HOSTS)!.textContent).toBe('full.example');
        expect(card.querySelector(REMOTE)!.getAttribute('src')).toMatch(/^https:\/\/thumbs\.example\//);
    });

    it('draws no button at all when the policy lets the host load', () => {
        aparteGlobalConfig.setImagePolicy(['https://a.example']);
        const card = drawn(setup, 'items', items('https://a.example/1.jpg'));
        expect(card.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(card.querySelector(BUTTON)).toBeNull();
    });

    it('behaves the same on a card the model wrote in a fence', async () => {
        stops.push(setupCardFences({ load: { items: async () => ({ setupItemsCard }) } }));
        const source = JSON.stringify(items('https://fence.example/1.jpg'));
        const host = document.createElement('div');
        host.innerHTML = aparteGlobalConfig.getCodeLanguageRenderer('card-items')!.render({ language: 'card-items', source, open: false } as never) as string;
        document.body.append(host);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(host.querySelector(REMOTE)).toBeNull();
        expect(host.querySelector(HOSTS)!.textContent).toBe('fence.example');
        host.querySelector<HTMLButtonElement>(BUTTON)!.click();
        expect(host.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(host.querySelector(BUTTON)).toBeNull();
    });
});
