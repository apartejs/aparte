import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupMediaCard, mediaCard, readMedia, readDuration, formatDuration, type MediaCardOptions } from './index.js';

const SUNSET = {
    src: 'https://cdn.example/sunset.jpg',
    title: 'Sunset over Lille',
    caption: 'The Grand Place at golden hour.',
    credit: 'Jane Doe',
    alt: 'An orange sky over a square of gabled houses',
    width: 1600,
    height: 900,
    url: 'https://photos.example/jane/sunset',
};

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ src: `https://cdn.example/p${i}.jpg`, ...(i === 1 ? { title: `Photo ${i}` } : {}) }));

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    stop = () => {};
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { prompt: 'a lighthouse at dusk' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'make_image', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function setup(options: MediaCardOptions = {}): void {
    stop = setupMediaCard({ tool: 'make_image', ...options });
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = aparteGlobalConfig.getToolRenderer('make_image')!.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('the media card on a tool', () => {
    beforeEach(() => setup());

    it('draws one image large: its frame at its shape, its title, caption, credit and source', () => {
        const card = draw(call('resolved', SUNSET));
        expect(card.dataset.card).toBe('media');
        expect(card.dataset.variant).toBe('single');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Sunset over Lille');
        const figure = card.querySelector('figure.aparte-media--single')!;
        const frame = figure.querySelector<HTMLButtonElement>('button.aparte-media__frame')!;
        expect(frame.getAttribute('aria-haspopup')).toBe('dialog');
        expect(frame.getAttribute('title')).toBe('View larger');
        expect(frame.hasAttribute('data-sized')).toBe(true);
        expect(frame.style.getPropertyValue('--aparte-media-ratio')).toBe('1600 / 900');
        const img = frame.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('https://cdn.example/sunset.jpg');
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('decoding')).toBe('async');
        expect(img.getAttribute('alt')).toBe('An orange sky over a square of gabled houses');
        expect(text(figure, 'figcaption .aparte-media__title')).toBe('Sunset over Lille');
        expect(text(figure, '.aparte-media__caption')).toBe('The Grand Place at golden hour.');
        expect(text(figure, '.aparte-media__credit')).toBe('Jane Doe');
        const source = figure.querySelector<HTMLAnchorElement>('a.aparte-media__source')!;
        expect(source.getAttribute('href')).toBe('https://photos.example/jane/sunset');
        expect(source.textContent).toBe('photos.example');
        expect(source.rel).toBe('noopener noreferrer');
        expect(source.target).toBe('_blank');
    });

    it('shows a skeleton with the prompt while the call runs, in the shape of each variant', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('a lighthouse at dusk — Loading');
        expect(text(card, '.aparte-media__title')).toBe('a lighthouse at dusk');
        expect(card.querySelector('.aparte-media__sk-frame')).not.toBeNull();
        const blind = draw(call('pending', undefined, {}));
        expect(blind.getAttribute('aria-label')).toBe('Media — Loading');
        expect(blind.querySelectorAll('.aparte-skeleton').length).toBeGreaterThanOrEqual(3);
        stop();
        setup({ variant: 'gallery' });
        const gallery = draw(call('pending', undefined, {}));
        expect(gallery.querySelectorAll('.aparte-media__grid[data-count="4"] > .aparte-media__sk-cell')).toHaveLength(4);
        expect(text(draw(call('pending')), '.aparte-media__heading-title')).toBe('a lighthouse at dusk');
        stop();
        setup({ variant: 'strip' });
        expect(draw(call('pending', undefined, {})).querySelectorAll('.aparte-media__sk-thumb')).toHaveLength(4);
        expect(text(draw(call('pending')), '.aparte-media__heading-title')).toBe('a lighthouse at dusk');
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-media')).toBeNull();
        expect(text(failed, '.aparte-rich-card__strip-title')).toBe('a lighthouse at dusk');
    });

    it('says it is unavailable, and warns once, when the result holds no medium', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { data: [{ b64_json: 'AAAA' }] }));
        draw(call('resolved', []));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('make_image')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', photos(3)));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.querySelectorAll('.aparte-media__tile')).toHaveLength(3);
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', photos(3)));
        expect(card.getAttribute('aria-label')).toBe('3 photos');
        expect(text(card, '.aparte-media__count')).toBe('3 photos');
    });

    it('relabels in place on a language switch, adding no node — the open lightbox too', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('make_image')!;
        const cases: Array<[MediaCardOptions['variant'], unknown]> = [
            ['single', SUNSET],
            ['gallery', [...photos(8), { src: 'https://cdn.example/clip.mp4', title: 'Clip', duration: 222 }]],
            ['strip', photos(4)],
        ];
        for (const [variant, data] of cases) {
            stop();
            setup({ variant });
            const card = draw(call('resolved', data));
            const opener = card.querySelector<HTMLElement>('.aparte-media__tile, .aparte-media__frame')!;
            opener.click();
            const count = card.querySelectorAll('*').length;
            aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
            renderer.relabel!(card, call('resolved', data));
            expect(card.querySelectorAll('*').length).toBe(count);
            expect(card.querySelector('.aparte-media__lb-close')!.getAttribute('aria-label')).toBe('Fermer');
            if (variant === 'single') {
                expect(card.querySelector('.aparte-media__frame')!.getAttribute('title')).toBe('Agrandir');
            }
            if (variant === 'gallery') {
                expect(card.getAttribute('aria-label')).toBe('9 éléments');
                expect(text(card, '.aparte-media__lb-counter')).toBe('1 sur 9');
                expect(card.querySelector('.aparte-media__lb-nav--next')!.getAttribute('aria-label')).toBe('Suivant');
                const tiles = card.querySelectorAll('.aparte-media__tile');
                expect(tiles[0]!.getAttribute('aria-label')).toBe('Image 1');
                expect(tiles[5]!.getAttribute('aria-label')).toBe('Image 6, 3 de plus');
                expect(text(card, '.aparte-media__more')).toBe('+3');
            }
            if (variant === 'strip') {
                expect(card.querySelector('.aparte-rich-card__carousel')!.getAttribute('aria-label')).toBe('4 photos');
                expect(card.querySelector('.aparte-rich-card__slide')!.getAttribute('aria-label')).toBe('1 sur 4');
            }
            aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        }
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsMediaPhotoCount: '{n} clichés' });
        expect(draw(call('resolved', photos(2))).getAttribute('aria-label')).toBe('2 clichés');
    });

    it('never parses a value from the tool as markup, and loads or opens nothing it should not', () => {
        const evil = '<img src=x onerror="window.__pwned=1">';
        const card = draw(call('resolved', {
            src: 'https://cdn.example/a.jpg', title: evil, caption: `${evil}!`, credit: evil, alt: evil,
            url: 'javascript:alert(1)', poster: 'javascript:alert(1)',
        }));
        expect(card.querySelectorAll('img')).toHaveLength(1);
        expect(card.querySelector('a')).toBeNull();
        expect(text(card, '.aparte-media__title')).toBe(evil);
        expect(text(card, '.aparte-media__caption')).toBe(`${evil}!`);
        expect(text(card, '.aparte-media__credit')).toBe(evil);
        expect(card.querySelector('img')!.getAttribute('alt')).toBe(evil);
        expect((window as any).__pwned).toBeUndefined();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(draw(call('resolved', { src: 'javascript:alert(1)' })).dataset.state).toBe('unavailable');
        expect(draw(call('resolved', { src: 'data:image/png;base64,AAAA' })).dataset.state).toBe('unavailable');
        warn.mockRestore();
    });
});

describe('videos and sounds', () => {
    beforeEach(() => setup());

    it('plays a video in the browser’s own player, its length fetched and nothing more', () => {
        const card = draw(call('resolved', { src: 'https://cdn.example/clip.mp4', poster: 'https://cdn.example/clip.jpg', title: 'Clip', width: 1080, height: 1920 }));
        const video = card.querySelector('video')!;
        expect(video.hasAttribute('controls')).toBe(true);
        expect(video.getAttribute('preload')).toBe('metadata');
        expect(video.hasAttribute('playsinline')).toBe(true);
        expect(video.getAttribute('poster')).toBe('https://cdn.example/clip.jpg');
        expect(video.getAttribute('aria-label')).toBe('Clip');
        expect(card.querySelector('.aparte-media__frame--video')!.getAttribute('style')).toContain('1080 / 1920');
        expect(card.querySelector('iframe')).toBeNull();
    });

    it('links a YouTube or Vimeo page out as a poster tile — never an iframe', () => {
        const card = draw(call('resolved', { url: 'https://www.youtube.com/watch?v=abc', title: 'Talk', thumbnail: 'https://i.example/abc.jpg', duration: 'PT1H2M3S' }));
        expect(card.querySelector('iframe')).toBeNull();
        const link = card.querySelector<HTMLAnchorElement>('a.aparte-media__external')!;
        expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.getAttribute('aria-label')).toBe('Talk — Watch on YouTube');
        expect(link.querySelector('img')!.getAttribute('src')).toBe('https://i.example/abc.jpg');
        expect(text(link, '.aparte-media__site')).toBe('YouTube');
        expect(text(link, '.aparte-media__duration')).toBe('1:02:03');
        expect(link.querySelector('.aparte-media__duration')!.getAttribute('datetime')).toBe('PT1H2M3S');
        const vimeo = readMedia('https://vimeo.com/76979871')!.items[0]!;
        expect(vimeo).toMatchObject({ kind: 'video', site: 'Vimeo' });
        expect(readMedia({ kind: 'image', src: 'https://youtu.be/x' })!.items[0]!.site).toBe('YouTube');
    });

    it('draws a sound under a header with its cover, title, credit, length and a waveform that moves while it plays', () => {
        const card = draw(call('resolved', { src: 'https://cdn.example/ep1.mp3', title: 'Episode 1', author: 'The Show', duration: 222, poster: 'https://cdn.example/cover.jpg' }));
        const block = card.querySelector('.aparte-media__audio')!;
        expect(text(block, '.aparte-media__audio-title')).toBe('Episode 1');
        expect(text(block, '.aparte-media__audio-credit')).toBe('The Show');
        expect(text(block, '.aparte-media__audio-length')).toBe('3:42');
        expect(block.querySelector('.aparte-media__cover img')!.getAttribute('src')).toBe('https://cdn.example/cover.jpg');
        expect(block.querySelector('.aparte-media__wave')!.getAttribute('aria-hidden')).toBe('true');
        const audio = block.querySelector('audio')!;
        expect(audio.hasAttribute('controls')).toBe(true);
        expect(audio.getAttribute('preload')).toBe('metadata');
        audio.dispatchEvent(new Event('play'));
        expect(block.hasAttribute('data-playing')).toBe(true);
        audio.dispatchEvent(new Event('pause'));
        expect(block.hasAttribute('data-playing')).toBe(false);
        // The title is in the header, not again under it; the credit too.
        expect(card.querySelector('figcaption')).toBeNull();
        const bare = draw(call('resolved', { src: 'https://cdn.example/x.ogg' }));
        expect(text(bare, '.aparte-media__audio-title')).toBe('Audio');
        expect(bare.querySelector('.aparte-media__audio-length')).toBeNull();
    });

    it('falls back to the placeholder when a picture fails to load', () => {
        const card = draw(call('resolved', { src: 'https://cdn.example/gone.jpg' }));
        const frame = card.querySelector('.aparte-media__frame')!;
        expect(frame.hasAttribute('data-sized')).toBe(false);
        expect(frame.hasAttribute('data-loading')).toBe(true);
        frame.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(frame.querySelector('img')).toBeNull();
        expect(frame.hasAttribute('data-broken')).toBe(true);
        expect(frame.hasAttribute('data-loading')).toBe(false);
        expect(frame.querySelector('.aparte-media__placeholder')).not.toBeNull();
        const ok = draw(call('resolved', { src: 'https://cdn.example/ok.jpg' }));
        ok.querySelector('img')!.dispatchEvent(new Event('load'));
        expect(ok.querySelector('.aparte-media__frame')!.hasAttribute('data-loading')).toBe(false);
    });
});

describe('variants', () => {
    it('lays several media out as a mosaic whatever the variant, the last tile saying how many more', () => {
        setup();
        const card = draw(call('resolved', { title: 'Lille', items: photos(9) }));
        expect(card.dataset.variant).toBe('single');
        const grid = card.querySelector('ul.aparte-media__grid')!;
        expect(grid.getAttribute('data-count')).toBe('6');
        expect(grid.getAttribute('aria-label')).toBe('Lille');
        expect(grid.querySelectorAll(':scope > li > button.aparte-media__tile')).toHaveLength(6);
        expect(card.querySelectorAll('.aparte-media__more')).toHaveLength(1);
        expect(text(grid.lastElementChild!, '.aparte-media__more')).toBe('+3');
        expect(grid.lastElementChild!.querySelector('button')!.getAttribute('aria-label')).toBe('Image 6, 3 more');
        expect(text(card, '.aparte-media__heading-title')).toBe('Lille');
        expect(text(card, '.aparte-media__count')).toBe('9 photos');
        // The tile's picture is decoration: the button carries the name.
        expect(grid.querySelector('img')!.getAttribute('alt')).toBe('');
        expect(grid.querySelectorAll('li')[1]!.querySelector('button')!.getAttribute('aria-label')).toBe('Photo 1');
    });

    it.each([2, 3, 4, 5, 6])('fills the mosaic for %i media with no "+n"', (n) => {
        setup({ variant: 'gallery' });
        const card = draw(call('resolved', photos(n)));
        expect(card.querySelector('.aparte-media__grid')!.getAttribute('data-count')).toBe(String(n));
        expect(card.querySelector('.aparte-media__more')).toBeNull();
    });

    it('names video and sound tiles by what they are and how long they last', () => {
        setup({ variant: 'gallery' });
        const card = draw(call('resolved', [
            { src: 'https://cdn.example/a.webm', title: 'Clip', duration: 65, poster: 'https://cdn.example/a.jpg' },
            { src: 'https://cdn.example/b', mimeType: 'audio/mpeg', title: 'Song', duration: 3725 },
            { src: 'https://cdn.example/c', type: 'video' },
        ]));
        const tiles = card.querySelectorAll('.aparte-media__tile');
        expect(tiles[0]!.getAttribute('data-kind')).toBe('video');
        expect(tiles[0]!.getAttribute('aria-label')).toBe('Clip, Video, 1 min 5 sec');
        expect(tiles[0]!.querySelector('.aparte-media__play')).not.toBeNull();
        expect(text(tiles[0]!, '.aparte-media__duration')).toBe('1:05');
        expect(tiles[1]!.getAttribute('data-kind')).toBe('audio');
        expect(tiles[1]!.getAttribute('aria-label')).toBe('Song, Audio, 1 hr 2 min 5 sec');
        expect(text(tiles[1]!, '.aparte-media__tile-title')).toBe('Song');
        expect(tiles[2]!.getAttribute('aria-label')).toBe('Video 3');
        expect(tiles[2]!.querySelector('img')).toBeNull();
        expect(card.getAttribute('aria-label')).toBe('3 items');
        expect(draw(call('resolved', [{ src: 'https://cdn.example/a.mp4' }, { src: 'https://cdn.example/b.mov' }])).getAttribute('aria-label')).toBe('2 videos');
    });

    it('lays a strip out as square thumbnails in the kit carousel, titled', () => {
        setup({ variant: 'strip' });
        const card = draw(call('resolved', photos(5)));
        const carousel = card.querySelector('.aparte-rich-card__carousel')!;
        expect(carousel.getAttribute('aria-label')).toBe('5 photos');
        expect(carousel.querySelectorAll('.aparte-rich-card__slide .aparte-media__thumb > .aparte-media__tile')).toHaveLength(5);
        expect(texts(card, '.aparte-media__thumb-title')).toEqual(['Photo 1']);
        expect(card.querySelector('.aparte-media__more')).toBeNull();
        expect(text(card, '.aparte-media__count')).toBe('5 photos');
    });

    it('draws one medium large whatever the variant', () => {
        setup({ variant: 'strip' });
        expect(draw(call('resolved', [SUNSET])).querySelector('.aparte-media--single')).not.toBeNull();
        stop();
        setup({ variant: (d) => (d.items.length > 3 ? 'strip' : 'gallery') });
        expect(draw(call('resolved', photos(4))).dataset.variant).toBe('strip');
        expect(draw(call('resolved', photos(2))).dataset.variant).toBe('gallery');
    });

    it('draws 24 media at most', () => {
        setup({ variant: 'strip' });
        const card = draw(call('resolved', photos(40)));
        expect(card.querySelectorAll('.aparte-media__tile')).toHaveLength(24);
        expect(card.getAttribute('aria-label')).toBe('24 photos');
    });
});

describe('the lightbox', () => {
    beforeEach(() => setup({ variant: 'gallery' }));

    const items = [
        { src: 'https://cdn.example/1.jpg', title: 'One', caption: 'First', credit: 'Ann', url: 'https://site.example/1' },
        { src: 'https://cdn.example/2.jpg', alt: 'A dog' },
        { src: 'https://cdn.example/3.mp4', title: 'Clip' },
        { src: 'https://cdn.example/4.mp3', title: 'Song' },
        { src: 'https://youtu.be/xyz', title: 'Talk' },
    ];

    it('opens on the tile clicked, steps with its buttons and the arrows, and hands the focus back', () => {
        const card = draw(call('resolved', items));
        expect(card.querySelector('dialog')).toBeNull();
        const tiles = card.querySelectorAll<HTMLButtonElement>('.aparte-media__tile');
        tiles[1]!.focus();
        tiles[1]!.click();
        const dialog = card.querySelector('dialog')!;
        expect(dialog.className).toContain('aparte-dialog');
        expect(dialog.hasAttribute('open')).toBe(true);
        const title = dialog.querySelector('.aparte-media__lb-title')!;
        expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
        expect(title.textContent).toBe('A dog');
        expect(text(dialog, '.aparte-media__lb-counter')).toBe('2 of 5');
        const img = dialog.querySelector<HTMLImageElement>('.aparte-media__lb-img')!;
        expect(img.getAttribute('src')).toBe('https://cdn.example/2.jpg');
        expect(img.getAttribute('alt')).toBe('A dog');
        expect(img.hasAttribute('loading')).toBe(false);
        expect(dialog.querySelector<HTMLElement>('.aparte-media__lb-caption')!.hidden).toBe(true);

        const prev = dialog.querySelector<HTMLButtonElement>('.aparte-media__lb-nav--prev')!;
        const next = dialog.querySelector<HTMLButtonElement>('.aparte-media__lb-nav--next')!;
        prev.click();
        expect(title.textContent).toBe('One');
        expect(prev.getAttribute('aria-disabled')).toBe('true');
        expect(next.getAttribute('aria-disabled')).toBe('false');
        expect(text(dialog, '.aparte-media__lb-caption .aparte-media__caption')).toBe('First');
        expect(text(dialog, '.aparte-media__lb-caption .aparte-media__credit')).toBe('Ann');
        expect(dialog.querySelector('.aparte-media__lb-caption a')!.getAttribute('href')).toBe('https://site.example/1');
        // At the start, Previous leaves the stage as it is.
        const stage = dialog.querySelector('.aparte-media__lb-stage')!.firstElementChild;
        prev.click();
        expect(dialog.querySelector('.aparte-media__lb-stage')!.firstElementChild).toBe(stage);

        key(dialog, 'ArrowRight');
        key(dialog, 'ArrowRight');
        expect(dialog.querySelector('.aparte-media__lb-stage video')!.getAttribute('src')).toBe('https://cdn.example/3.mp4');
        expect(dialog.querySelector('.aparte-media__lb-stage')!.getAttribute('data-kind')).toBe('video');
        key(dialog, 'End');
        expect(dialog.querySelector('.aparte-media__lb-stage a.aparte-media__external')).not.toBeNull();
        expect(next.getAttribute('aria-disabled')).toBe('true');
        key(dialog, 'ArrowLeft');
        expect(dialog.querySelector('.aparte-media__lb-stage .aparte-media__audio audio')).not.toBeNull();
        key(dialog, 'Home');
        expect(title.textContent).toBe('One');
        // A player's own keys are left to it.
        key(dialog, 'End');
        key(dialog, 'ArrowLeft');
        key(dialog, 'ArrowLeft');
        const video = dialog.querySelector('video')!;
        key(video, 'ArrowLeft');
        expect(dialog.querySelector('video')).toBe(video);

        tiles[0]!.blur();
        key(dialog, 'Escape');
        expect(dialog.hasAttribute('open')).toBe(false);
        expect(document.activeElement).toBe(tiles[1]);
    });

    it('closes through the native dialog when there is one, from its button, and reuses the same dialog', () => {
        const proto = HTMLDialogElement.prototype as any;
        proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
        proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
        Object.defineProperty(proto, 'open', { configurable: true, get(this: HTMLDialogElement) { return this.hasAttribute('open'); } });
        try {
            const card = draw(call('resolved', items));
            const tiles = card.querySelectorAll<HTMLButtonElement>('.aparte-media__tile');
            tiles[2]!.click();
            const dialog = card.querySelector('dialog')!;
            expect(dialog.hasAttribute('open')).toBe(true);
            // Escape is the browser's own, there.
            expect(key(dialog, 'Escape')).toBe(true);
            const pause = vi.fn();
            const video = dialog.querySelector('video')!;
            Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
            video.pause = pause;
            dialog.querySelector<HTMLButtonElement>('.aparte-media__lb-close')!.click();
            expect(dialog.hasAttribute('open')).toBe(false);
            expect(pause).toHaveBeenCalledTimes(1);
            expect(document.activeElement).toBe(tiles[2]);
            tiles[0]!.click();
            expect(card.querySelectorAll('dialog')).toHaveLength(1);
            expect(dialog.querySelector('.aparte-media__lb-title')!.textContent).toBe('One');
        } finally {
            delete proto.showModal;
            delete proto.close;
            delete proto.open;
        }
    });

    it('opens one image larger, with neither counter nor arrows', () => {
        stop();
        setup();
        const card = draw(call('resolved', SUNSET));
        card.querySelector<HTMLButtonElement>('.aparte-media__frame')!.click();
        const dialog = card.querySelector('dialog')!;
        expect(dialog.querySelector('.aparte-media__lb-counter')).toBeNull();
        expect(dialog.querySelector('.aparte-media__lb-nav')).toBeNull();
        expect(text(dialog, '.aparte-media__lb-title')).toBe('Sunset over Lille');
        expect(dialog.querySelector('.aparte-media__lb-img')!.getAttribute('alt')).toBe('An orange sky over a square of gabled houses');
        const stage = dialog.querySelector('.aparte-media__lb-stage')!.firstElementChild;
        key(dialog, 'ArrowRight');
        expect(dialog.querySelector('.aparte-media__lb-stage')!.firstElementChild).toBe(stage);
        dialog.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(dialog.querySelector('.aparte-media__lb-picture')!.hasAttribute('data-broken')).toBe(true);
    });
});

describe('the media card as a segment', () => {
    it('draws a card segment, and its fallback sentence gives each medium and its address', () => {
        stop = setupMediaCard();
        const segment = mediaCard.segment([SUNSET, { src: 'https://cdn.example/ep.mp3', duration: 222 }], { variant: 'strip' });
        expect(segment.fallback).toBe('Sunset over Lille — Jane Doe: https://cdn.example/sunset.jpg\nAudio 2 (3:42): https://cdn.example/ep.mp3');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('media');
        expect(out.dataset.variant).toBe('strip');
        expect(out.querySelectorAll('.aparte-media__tile')).toHaveLength(2);
        expect(mediaCard.segment({ title: 'Trip', items: ['https://cdn.example/a.png'] }).fallback).toBe('Trip:\nImage: https://cdn.example/a.png');
        expect(mediaCard.segment({ nothing: true }).fallback).toBeUndefined();
    });
});

describe('reading the data', () => {
    it("reads Unsplash, Pexels and an image model's answer", () => {
        const unsplash = readMedia({ total: 1, results: [{
            urls: { raw: 'https://images.unsplash.com/r', regular: 'https://images.unsplash.com/reg', small: 'https://images.unsplash.com/sm' },
            alt_description: 'a red bicycle', description: 'Spring in Amsterdam', width: 4000, height: 6000,
            user: { name: 'Mia K', username: 'miak' }, links: { html: 'https://unsplash.com/photos/abc' },
        }] })!.items[0]!;
        expect(unsplash).toMatchObject({
            kind: 'image', src: 'https://images.unsplash.com/reg', poster: 'https://images.unsplash.com/sm', alt: 'a red bicycle',
            caption: 'Spring in Amsterdam', credit: 'Mia K', width: 4000, height: 6000, url: 'https://unsplash.com/photos/abc',
        });

        const dalle = readMedia({ created: 1, data: [{ url: 'https://oai.example/img-1.png', revised_prompt: 'A lighthouse at dusk, oil painting' }, { b64_json: 'AAAA' }] })!;
        expect(dalle.items).toHaveLength(1);
        expect(dalle.items[0]).toMatchObject({ kind: 'image', src: 'https://oai.example/img-1.png', caption: 'A lighthouse at dusk, oil painting', alt: 'A lighthouse at dusk, oil painting' });
        expect(dalle.items[0]!.url).toBeUndefined();

        const pexels = readMedia({ photos: [{ src: { original: 'https://px.example/o.jpg', large: 'https://px.example/l.jpg' }, photographer: 'Sam', url: 'https://www.pexels.com/photo/1', alt: 'Hills' }] })!.items[0]!;
        expect(pexels).toMatchObject({ src: 'https://px.example/l.jpg', credit: 'Sam', url: 'https://www.pexels.com/photo/1', alt: 'Hills' });
        const pexelsVideo = readMedia({ videos: [{ image: 'https://px.example/still.jpg', duration: 12, url: 'https://www.pexels.com/video/2', user: { name: 'Lee' }, video_files: [{ link: 'https://px.example/v.mp4', file_type: 'video/mp4' }] }] })!.items[0]!;
        expect(pexelsVideo).toMatchObject({ kind: 'video', src: 'https://px.example/v.mp4', poster: 'https://px.example/still.jpg', duration: 12, credit: 'Lee', mimeType: 'video/mp4' });
    });

    it('reads the aliases of each field', () => {
        const one = (raw: object) => readMedia(raw)!.items[0]!;
        expect(one({ link: 'https://a.example/x.png', thumb: 'https://a.example/t.png', description: 'D', source: 'Wiki' }))
            .toMatchObject({ src: 'https://a.example/x.png', poster: 'https://a.example/t.png', caption: 'D', credit: 'Wiki' });
        expect(one({ href: 'https://a.example/x.png', preview: 'https://a.example/p.png' }).poster).toBe('https://a.example/p.png');
        expect(one({ imageUrl: 'https://a.example/x.png', url: 'https://page.example/' })).toMatchObject({ src: 'https://a.example/x.png', url: 'https://page.example/' });
        expect(one({ image: { url: 'https://a.example/i.png' } }).src).toBe('https://a.example/i.png');
        expect(one({ thumbnail: 'https://a.example/t.png', photographer: 'P' })).toMatchObject({ src: 'https://a.example/t.png', credit: 'P' });
        expect(one({ src: 'https://a.example/x.png', author: { name: 'Ann' } }).credit).toBe('Ann');
        // A credit that is an address is not a name.
        expect(one({ src: 'https://a.example/x.png', source: 'https://wiki.example' }).credit).toBeUndefined();
        expect(one({ src: 'https://a.example/s.mp3', duration_ms: 90500 }).duration).toBe(90.5);
        expect(one({ src: 'https://a.example/x', mime_type: 'video/webm' })).toMatchObject({ kind: 'video', mimeType: 'video/webm' });
        expect(one({ src: 'https://a.example/x', contentType: 'nonsense' }).mimeType).toBeUndefined();
        expect(one({ src: 'https://a.example/x', media_type: 'photo' }).kind).toBe('image');
        expect(one({ src: 'https://a.example/x', kind: 'podcast' }).kind).toBe('audio');
        expect(one({ src: 'https://a.example/x.flac' }).kind).toBe('audio');
        expect(one({ src: 'https://a.example/x.MOV?sig=1' }).kind).toBe('video');
        expect(one({ src: 'https://a.example/x' }).kind).toBe('image');
        // Only both sides of a shape say anything; nothing below zero.
        expect(one({ src: 'https://a.example/x', width: 100 }).width).toBeUndefined();
        expect(one({ src: 'https://a.example/x', width: -1, height: 10 }).height).toBeUndefined();
        expect(one({ src: 'https://a.example/x', poster: 'https://a.example/x' }).poster).toBeUndefined();
    });

    it('reads one medium, a list of addresses, and collections; nothing else', () => {
        expect(readMedia('https://a.example/x.png')!.items).toHaveLength(1);
        expect(readMedia(['https://a.example/x.png', 'nope', 3, null])!.items).toHaveLength(1);
        expect(readMedia({ title: 'T', images: ['https://a.example/x.png'] })).toMatchObject({ title: 'T' });
        expect(readMedia({ title: 'Not a collection', src: 'https://a.example/x.png' })!.title).toBeUndefined();
        expect(readMedia(null)).toBeNull();
        expect(readMedia(42)).toBeNull();
        expect(readMedia({ items: [] })).toBeNull();
        expect(readMedia([[1]])).toBeNull();
        expect(readMedia({ src: '/img/a.jpg' })!.items[0]!.src).toMatch(/^https?:\/\/[^/]+\/img\/a\.jpg$/);
        expect(readMedia({ src: '//cdn.example/a.jpg' })!.items[0]!.src).toBe('https://cdn.example/a.jpg');
        expect(readMedia({ src: 'places/x/photos/y' })).toBeNull();
    });

    it('reads a length as tools write it, and writes it as a player does', () => {
        expect(readDuration(222)).toBe(222);
        expect(readDuration('222')).toBe(222);
        expect(readDuration('3:42')).toBe(222);
        expect(readDuration('75:00')).toBe(4500);
        expect(readDuration('1:02:03')).toBe(3723);
        expect(readDuration('PT3M42S')).toBe(222);
        expect(readDuration('PT1H')).toBe(3600);
        expect(readDuration('PT')).toBeUndefined();
        expect(readDuration('1:75:00')).toBeUndefined();
        expect(readDuration('3:99')).toBeUndefined();
        expect(readDuration(-4)).toBeUndefined();
        expect(readDuration('soon')).toBeUndefined();
        expect(readDuration(undefined)).toBeUndefined();
        expect(formatDuration(aparteGlobalConfig, 5)).toBe('0:05');
        expect(formatDuration(aparteGlobalConfig, 222.4)).toBe('3:42');
        expect(formatDuration(aparteGlobalConfig, 3723)).toBe('1:02:03');
        expect(formatDuration(aparteGlobalConfig, 36_000)).toBe('10:00:00');
    });
});

describe('what the audit found', () => {
    beforeEach(() => setup());
    afterEach(() => vi.restoreAllMocks());

    it("links an HLS or DASH stream out where the browser's own <video> cannot play it", () => {
        const card = draw(call('resolved', { src: 'https://cdn.example/live/master.m3u8', title: 'Live', poster: 'https://cdn.example/live.jpg', url: 'https://tv.example/live' }));
        expect(card.querySelector('video')).toBeNull();
        const link = card.querySelector<HTMLAnchorElement>('a.aparte-media__external')!;
        // To the page that plays it, when the tool names one.
        expect(link.getAttribute('href')).toBe('https://tv.example/live');
        expect(text(link, '.aparte-media__site')).toBe('tv.example');
        expect(link.getAttribute('aria-label')).toBe('Live — Watch on tv.example');
        // Else to the stream itself.
        const dash = draw(call('resolved', { src: 'https://cdn.example/vod/manifest.mpd', title: 'VOD' }));
        expect(dash.querySelector('a.aparte-media__external')!.getAttribute('href')).toBe('https://cdn.example/vod/manifest.mpd');
        expect(readMedia({ src: 'https://cdn.example/s', mimeType: 'application/x-mpegURL' })!.items[0]!.kind).toBe('video');
    });

    it('plays an HLS stream in the native <video> where the browser says it can (Safari)', () => {
        vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) => (type === 'application/vnd.apple.mpegurl' ? 'maybe' : ''));
        const card = draw(call('resolved', { src: 'https://cdn.example/live/master.m3u8', title: 'Live' }));
        expect(card.querySelector('video')!.getAttribute('src')).toBe('https://cdn.example/live/master.m3u8');
        expect(card.querySelector('a.aparte-media__external')).toBeNull();
    });
});
