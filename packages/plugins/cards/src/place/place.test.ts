import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import {
    setupPlaceCard,
    placeCard,
    readPlaces,
    readHours,
    readTime,
    placeStatus,
    isOpenAt,
    directionsUrl,
    phoneUrl,
    type PlaceCardOptions,
} from './index.js';

// Monday 2 November 2026 (the kit's tests pin the same week: the 6th is a Friday).
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);
const MON = 2;
const TUE = 3;
const SAT = 7;
const SUN = 8;

/** Monday split at lunch, Tuesday all day, Friday and Saturday into the night; the rest closed. */
const WEEK = [
    { day: 1, open: '09:00', close: '12:00' },
    { day: 1, open: '14:00', close: '22:00' },
    { day: 'tuesday', open: '9:00', close: '22:00' },
    { day: 5, open: '18:00', close: '02:00' },
    { day: 6, open: '18:00', close: '02:00' },
];

const TRATTORIA = {
    name: 'Trattoria Da Enzo',
    category: 'Trattoria',
    types: ['restaurant', 'food'],
    image: 'https://example.com/enzo.jpg',
    rating: 4.6,
    reviewCount: 1284,
    priceLevel: 2,
    address: '12 Rue de la Paix, Lille',
    distance: 850,
    phone: '+33 3 20 00 00 00',
    website: 'https://enzo.example',
    url: 'https://maps.example/enzo',
    coordinates: { lat: 50.637, lng: 3.063 },
    hours: WEEK,
    tags: ['Terrace', 'Vegan options'],
};

const CAFE = { name: 'Café Méert', types: ['cafe', 'store'], rating: 4.4, address: '27 Rue Esquermoise', distance: 1500 };
const HOTEL = { name: 'Hôtel Carlton', types: ['lodging'], openNow: true };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    stop = () => {};
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { query: 'pizza in Lille' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'find_places', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function setup(options: PlaceCardOptions = {}): void {
    stop = setupPlaceCard({ tool: 'find_places', now: () => at(MON, 19), ...options });
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = aparteGlobalConfig.getToolRenderer('find_places')!.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);

describe('the place card on a tool', () => {
    beforeEach(() => setup());

    it('draws one place as a tile: photo, category, name, rating, price, status, address, buttons', () => {
        const card = draw(call('resolved', TRATTORIA));
        expect(card.dataset.card).toBe('place');
        expect(card.dataset.variant).toBe('card');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Trattoria Da Enzo');
        const img = card.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('https://example.com/enzo.jpg');
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('decoding')).toBe('async');
        expect(img.getAttribute('alt')).toBe('Photo of Trattoria Da Enzo');
        expect(text(card, '.aparte-place__badge')).toBe('Trattoria');
        expect(card.querySelector('.aparte-place')!.getAttribute('data-kind')).toBe('restaurant');
        const link = card.querySelector<HTMLAnchorElement>('.aparte-place__name a')!;
        expect(link.textContent).toBe('Trattoria Da Enzo');
        expect(link.getAttribute('href')).toBe('https://maps.example/enzo');
        expect(link.rel).toBe('noopener noreferrer');
        expect(card.querySelector('.aparte-rich-card__rating')!.getAttribute('aria-label')).toBe('Rated 4.6 out of 5, 1,284 reviews');
        expect(text(card, '.aparte-place__price-on')).toBe('$$');
        expect(text(card, '.aparte-place__price-off')).toBe('$$');
        expect(card.querySelector('.aparte-place__price')!.getAttribute('aria-label')).toBe('Price level 2 of 4');
        expect(card.querySelector('.aparte-place__status')!.getAttribute('data-status')).toBe('open');
        expect(text(card, '.aparte-place__state')).toBe('Open');
        expect(text(card, '.aparte-place__next')).toMatch(/^Closes at 10\sPM$/u);
        expect(text(card, '.aparte-place__distance')).toBe('850 m');
        expect(text(card, '.aparte-place__address-text')).toBe('12 Rue de la Paix, Lille');
        expect(texts(card, '.aparte-place__action')).toEqual(['Directions', 'Call', 'Website']);
        expect(card.querySelector('.aparte-place__action')!.className).toContain('aparte-btn--primary');
    });

    it('shows a skeleton with what the input already says while the call runs', () => {
        const card = draw(call('pending', undefined, { name: 'Chez Paul' }));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(text(card, '.aparte-place__name')).toBe('Chez Paul');
        expect(card.getAttribute('aria-label')).toBe('Chez Paul — Loading');
        expect(card.querySelector('.aparte-place__sk-media')).not.toBeNull();
        expect(card.querySelectorAll('.aparte-skeleton').length).toBeGreaterThan(3);
        const searching = draw(call('pending'));
        expect(searching.getAttribute('aria-label')).toBe('pizza in Lille — Loading');
        const blind = draw(call('pending', undefined, {}));
        expect(blind.getAttribute('aria-label')).toBe('Places — Loading');
        expect(blind.querySelector('.aparte-place__sk-name')).not.toBeNull();
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-place')).toBeNull();
    });

    it('says it is unavailable, and warns once, when the result holds no place', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { results: [{ rating: 5 }] }));
        draw(call('resolved', []));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('find_places')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', TRATTORIA));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(text(card, '.aparte-place__name')).toBe('Trattoria Da Enzo');
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', TRATTORIA));
        expect(text(card, '.aparte-place__state')).toBe('Ouvert');
    });

    it('relabels in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('find_places')!;
        for (const variant of ['card', 'compact', 'detail'] as const) {
            stop();
            setup({ variant });
            const card = draw(call('resolved', variant === 'card' ? [TRATTORIA, CAFE] : TRATTORIA));
            const count = card.querySelectorAll('*').length;
            aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
            renderer.relabel!(card, call('resolved', TRATTORIA));
            expect(card.querySelectorAll('*').length).toBe(count);
            if (variant === 'card') {
                expect(card.getAttribute('aria-label')).toBe('2 lieux');
                expect(text(card, '.aparte-place__heading-text')).toBe('2 lieux');
                expect(card.querySelector('.aparte-place__action')!.getAttribute('aria-label')).toBe('Itinéraire');
                expect(text(card, '.aparte-place__distance')).toMatch(/^850\sm$/u);
                expect(texts(card, '.aparte-place__distance')[1]).toMatch(/^1,5\skm$/u);
            } else {
                expect(text(card, '.aparte-place__state')).toBe('Ouvert');
                expect(text(card, '.aparte-place__next')).toBe('Ferme à 22:00');
            }
            if (variant === 'detail') {
                expect(texts(card, '.aparte-place__action')).toEqual(['Itinéraire', 'Appeler', 'Site web']);
                expect(text(card, '.aparte-place__hours-title')).toBe('Horaires');
                expect(text(card, '.aparte-place__hours th')).toBe('lundi');
                expect(texts(card, '.aparte-place__hours td')[0]).toBe('09:00–12:00, 14:00–22:00');
                expect(texts(card, '.aparte-place__hours td')[2]).toBe('Fermé');
                expect(card.querySelector('img')!.getAttribute('alt')).toBe('Photo de Trattoria Da Enzo');
                expect(card.querySelector('.aparte-place__price')!.getAttribute('aria-label')).toBe('Gamme de prix 2 sur 4');
            }
            aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        }
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsPlaceDirections: 'Y aller', cardsPlace_hotel: 'Hébergement' });
        const card = draw(call('resolved', TRATTORIA));
        expect(text(card, '.aparte-place__action')).toBe('Y aller');
        expect(text(draw(call('resolved', HOTEL)), '.aparte-place__badge')).toBe('Hébergement');
    });

    it('never parses a value from the tool as markup, and opens no link it should not', () => {
        const evil = '<img src=x onerror="window.__pwned=1">';
        const card = draw(call('resolved', {
            ...TRATTORIA, name: evil, category: evil, address: evil, tags: [evil], phone: evil,
            image: 'javascript:alert(1)', url: 'javascript:alert(1)', website: 'data:text/html,hi',
        }));
        expect(card.querySelectorAll('img')).toHaveLength(0);
        expect(card.querySelector('a')).toBeNull();
        expect(text(card, '.aparte-place__name')).toBe(evil);
        expect(text(card, '.aparte-place__badge')).toBe(evil);
        expect(texts(card, '.aparte-place__action')).toEqual(['Directions']);
        expect((window as any).__pwned).toBeUndefined();
    });
});

describe('the hours', () => {
    it('reads the times tools write', () => {
        expect(readTime('09:00')).toBe(540);
        expect(readTime('0900')).toBe(540);
        expect(readTime('900')).toBe(540);
        expect(readTime('21h30')).toBe(1290);
        expect(readTime('9 PM')).toBe(1260);
        expect(readTime('12 AM')).toBe(0);
        expect(readTime('12:30 p.m.')).toBe(750);
        expect(readTime('24:00')).toBe(1440);
        expect(readTime({ hour: 9, minute: 30 })).toBe(570);
        expect(readTime({ hour: 25 })).toBeUndefined();
        expect(readTime('25:00')).toBeUndefined();
        expect(readTime('24:30')).toBeUndefined();
        expect(readTime('9:75')).toBeUndefined();
        expect(readTime('13 PM')).toBeUndefined();
        expect(readTime('noon')).toBeUndefined();
        expect(readTime('')).toBeUndefined();
    });

    it.each([
        ['Monday morning, open until lunch', at(MON, 10), true, at(MON, 12)],
        ['Monday at lunch, between two ranges: opens again today', at(MON, 12, 30), false, at(MON, 14)],
        ['Monday night, after closing: opens tomorrow', at(MON, 23), false, at(TUE, 9)],
        ['Tuesday night: next opening is Friday evening', at(TUE, 23), false, new Date(2026, 10, 6, 18)],
        ["Saturday 01:00, still in Friday's night", at(SAT, 1), true, at(SAT, 2)],
        ["Sunday 01:30, still in Saturday's night (across the week's end)", at(SUN, 1, 30), true, at(SUN, 2)],
        ['Sunday 03:00, closed all day: opens Monday', at(SUN, 3), false, new Date(2026, 10, 9, 9)],
        ['at the exact closing minute it is closed', at(MON, 22), false, at(TUE, 9)],
        ['at the exact opening minute it is open', at(MON, 14), true, at(MON, 22)],
    ])('%s', (_name, now, open, changesAt) => {
        const status = placeStatus(WEEK, now)!;
        expect(status.open).toBe(open);
        expect(status.changesAt?.getTime()).toBe(changesAt.getTime());
        expect(isOpenAt(WEEK, now)).toBe(open);
    });

    it('treats touching ranges as one, and the clock round as always open', () => {
        const lunch = [{ day: 1, open: '09:00', close: '12:00' }, { day: 1, open: '12:00', close: '14:00' }];
        expect(placeStatus(lunch, at(MON, 11, 30))!.changesAt!.getHours()).toBe(14);
        // Google writes "always open" as one period with no close.
        expect(placeStatus({ periods: [{ open: { day: 0, time: '0000' } }] }, at(MON, 3))).toEqual({ open: true });
        const everyDay = Array.from({ length: 7 }, (_, day) => ({ day, open: '00:00', close: '24:00' }));
        expect(placeStatus(everyDay, at(SUN, 23, 59))).toEqual({ open: true });
        expect(placeStatus([], at(MON, 10))).toBeNull();
        expect(isOpenAt(undefined, at(MON, 10))).toBe(false);
    });

    it("reads Google's periods, its weekday text, and a week by name", () => {
        const periods = readHours({ periods: [
            { open: { day: 5, time: '1800' }, close: { day: 6, time: '0200' } },
            { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
            { open: { day: 'x', time: '1800' } },
            { open: { day: 2, time: '0900' }, close: { day: 2 } },
        ] });
        expect(periods).toEqual([{ day: 1, start: 540, end: 1050 }, { day: 5, start: 1080, end: 1560 }]);
        expect(readHours({ weekday_text: ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: Closed', 'Sunday: Open 24 hours', 'nonsense'] }))
            .toEqual([{ day: 0, start: 0, end: 1440 }, { day: 1, start: 540, end: 1020 }]);
        expect(readHours({ mon: '09:00-12:00, 14:00-18:00', sunday: 'closed', saturday: ['10:00 to 16:00'], notes: '9-5' }))
            .toEqual([{ day: 1, start: 540, end: 720 }, { day: 1, start: 840, end: 1080 }, { day: 6, start: 600, end: 960 }]);
        // A Friday-to-Sunday stretch shows on each day it covers.
        expect(readHours({ periods: [{ open: { day: 5, time: '1800' }, close: { day: 0, time: '0200' } }] }))
            .toEqual([{ day: 0, start: 0, end: 120 }, { day: 5, start: 1080, end: 1440 }, { day: 6, start: 0, end: 1440 }]);
        expect(readHours([{ day: 7, open: '10:00' }, { day: 9, open: '10:00' }, { day: 1, open: '10:00', close: 'later' }, null, 'Monday 9-5']))
            .toEqual([{ day: 0, start: 600, end: 1440 }]);
        expect(readHours([{ day: 3, start: 60, end: 120 }, { day: 3, start: 120, end: 60 }])).toEqual([{ day: 3, start: 60, end: 120 }]);
        expect(readHours('9-5')).toEqual([]);
    });

    it('words the status for today, tomorrow, later in the week, and closing soon', () => {
        const status = (now: Date, data: unknown = TRATTORIA) => {
            stop();
            setup({ now: () => now });
            const card = draw(call('resolved', data));
            const line = card.querySelector('.aparte-place__status');
            return line ? [line.getAttribute('data-status'), text(card, '.aparte-place__state'), text(card, '.aparte-place__next')] : null;
        };
        expect(status(at(MON, 21, 30))).toEqual(['soon', 'Closes soon', '10 PM']);
        expect(status(at(MON, 12, 30))).toEqual(['closed', 'Closed', 'Opens at 2 PM']);
        expect(status(at(MON, 23))).toEqual(['closed', 'Closed', 'Opens tomorrow at 9 AM']);
        expect(status(at(TUE, 23))).toEqual(['closed', 'Closed', 'Opens Friday at 6 PM']);
        expect(status(at(SAT, 1, 30))).toEqual(['soon', 'Closes soon', '2 AM']);
        // Past midnight, a close an hour away is still "at", not a day.
        expect(status(at(SAT, 1))).toEqual(['open', 'Open', 'Closes at 2 AM']);
        expect(status(at(MON, 10))).toEqual(['open', 'Open', 'Closes at 12 PM']);
        // A close more than a day away names its day.
        const long = { name: 'Depot', hours: { periods: [{ open: { day: 1, time: '0800' }, close: { day: 3, time: '1800' } }] } };
        expect(status(at(MON, 9), long)).toEqual(['open', 'Open', 'Closes Wednesday at 6 PM']);
        expect(status(at(MON, 9), { name: 'Anywhere', hours: [{ day: 0, open: '00:00', close: '24:00' }, ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '0:00' }))] }))
            .toEqual(['open', 'Open 24 hours', null]);
        // No hours: the tool's own answer, alone; neither: no line.
        expect(status(at(MON, 9), { name: 'Hotel', openNow: false })).toEqual(['closed', 'Closed', null]);
        expect(status(at(MON, 9), { name: 'Hotel', open_now: true })).toEqual(['open', 'Open', null]);
        expect(status(at(MON, 9), { name: 'Somewhere' })).toBeNull();
        // Hours that never open.
        expect(placeStatus([{ day: 1, start: 0, end: 0 }], at(MON, 9))).toBeNull();
    });

    it("reads the hours on the place's own clock when its UTC offset is known", () => {
        // 19:00 UTC on Monday is 08:00 on Tuesday in Auckland (UTC+13 in November): not yet open.
        const now = new Date(Date.UTC(2026, 10, 2, 19, 0));
        stop = setupPlaceCard({ tool: 'find_places', now: () => now });
        const card = draw(call('resolved', { name: 'Kiwi', utc_offset_minutes: 780, hours: [{ day: 2, open: '09:00', close: '17:00' }] }));
        expect(text(card, '.aparte-place__next')).toBe('Opens at 9 AM');
    });
});

describe('the built-in buttons', () => {
    beforeEach(() => setup());

    it('builds directions, call and website links from the data, encoded', () => {
        expect(directionsUrl({ name: 'A', coordinates: { lat: 50.6, lng: 3.06 } }))
            .toBe('https://www.google.com/maps/dir/?api=1&destination=50.6%2C3.06');
        expect(directionsUrl({ name: 'Café & Co', address: '1 rue #2', placeId: 'ChIJ x' }))
            .toBe('https://www.google.com/maps/dir/?api=1&destination=Caf%C3%A9%20%26%20Co%2C%201%20rue%20%232&destination_place_id=ChIJ%20x');
        expect(directionsUrl({ name: 'Nowhere' })).toBeNull();
        expect(phoneUrl('+33 3 20 00 00 00')).toBe('tel:+33320000000');
        expect(phoneUrl('(555) 123-4567')).toBe('tel:5551234567');
        expect(phoneUrl('call us')).toBeNull();
        expect(phoneUrl(undefined)).toBeNull();
    });

    it('opens the link through the kit, and tells the app which button it was', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        const card = draw(call('resolved', TRATTORIA));
        const seen: unknown[] = [];
        document.addEventListener('aparte-card-action', (e) => seen.push((e as CustomEvent).detail.action.id), { once: true });
        card.querySelector<HTMLButtonElement>('[data-action="directions"]')!.click();
        expect(seen).toEqual(['directions']);
        expect(open).toHaveBeenCalledWith('https://www.google.com/maps/dir/?api=1&destination=50.637%2C3.063', '_blank', 'noopener,noreferrer');
        // A `tel:` link hands over to the phone app (the kit sets the location, no new tab):
        // the app is told the link, and cancels here because jsdom cannot navigate.
        let link: unknown;
        document.addEventListener('aparte-card-action', (e) => { link = (e as CustomEvent).detail.action.url; e.preventDefault(); }, { once: true });
        card.querySelector<HTMLButtonElement>('[data-action="call"]')!.click();
        expect(link).toBe('tel:+33320000000');
        expect(open).toHaveBeenCalledTimes(1);
        open.mockRestore();
    });

    it('draws only the buttons the data can honour', () => {
        expect(texts(draw(call('resolved', { name: 'Bare' })), '.aparte-place__action')).toEqual([]);
        expect(draw(call('resolved', { name: 'Bare' })).querySelector('.aparte-place__actions')).toBeNull();
        expect(texts(draw(call('resolved', { name: 'P', phone: '0320000000' })), '.aparte-place__action')).toEqual(['Call']);
        // A page of its own stands in for a site; a bare domain is read as https.
        const site = draw(call('resolved', { name: 'S', url: 'https://maps.example/s' }));
        expect(texts(site, '.aparte-place__action')).toEqual(['Website']);
        expect(readPlaces({ name: 'D', website: 'trattoria.fr/menu' })!.places[0]!.website).toBe('https://trattoria.fr/menu');
    });

    it("stays beside the app's own actions, which are the card's, and goes only when asked", () => {
        stop();
        setup({ actions: (data) => [{ label: `Book ${data.places[0]!.name}`, id: 'book' }] });
        const card = draw(call('resolved', TRATTORIA));
        expect(card.querySelector('[data-action]')).not.toBeNull();
        expect(texts(card, '.aparte-rich-card__actions > .aparte-rich-card__action')).toEqual(['Book Trattoria Da Enzo']);
        stop();
        setup({ builtIns: false, actions: () => [{ label: 'Book', id: 'book' }] });
        const bare = draw(call('resolved', TRATTORIA));
        expect(bare.querySelector('[data-action]')).toBeNull();
    });
});

describe('variants', () => {
    it('lays several places out as tiles in a carousel, with icon-only buttons', () => {
        setup();
        const card = draw(call('resolved', { title: 'Pizza near you', places: [TRATTORIA, CAFE, HOTEL] }));
        expect(card.getAttribute('aria-label')).toBe('Pizza near you');
        expect(text(card, '.aparte-place__heading-text')).toBe('Pizza near you');
        const carousel = card.querySelector('.aparte-rich-card__carousel')!;
        expect(carousel.getAttribute('aria-label')).toBe('Pizza near you');
        const tiles = card.querySelectorAll('.aparte-place--tile');
        expect(tiles).toHaveLength(3);
        expect([...tiles].map((t) => t.getAttribute('data-kind'))).toEqual(['restaurant', 'cafe', 'hotel']);
        const first = tiles[0]!.querySelector('.aparte-place__action')!;
        expect(first.className).toContain('aparte-btn--icon');
        expect(first.className).not.toContain('aparte-btn--primary');
        expect(first.getAttribute('aria-label')).toBe('Directions');
        expect(first.getAttribute('title')).toBe('Directions');
        expect(first.textContent).toBe('');
        // The cafe has no photo: the placeholder stands, and its kind names it.
        expect(tiles[1]!.querySelector('.aparte-place__media')!.hasAttribute('data-empty')).toBe(true);
        expect(text(tiles[1]!, '.aparte-place__badge')).toBe('Café');
        expect(text(tiles[1]!, '.aparte-place__distance')).toBe('1.5 km');
    });

    it('draws ten places at most, and names a collection by its count', () => {
        setup();
        const many = Array.from({ length: 14 }, (_, i) => ({ name: `Place ${i}` }));
        const card = draw(call('resolved', many));
        expect(card.querySelectorAll('.aparte-place--tile')).toHaveLength(10);
        expect(card.getAttribute('aria-label')).toBe('10 places');
    });

    it('stacks compact rows in a list, one row for one place', () => {
        setup({ variant: 'compact' });
        const card = draw(call('resolved', [TRATTORIA, CAFE]));
        const list = card.querySelector('ul.aparte-place__list')!;
        expect(list.getAttribute('aria-label')).toBe('2 places');
        expect(list.querySelectorAll(':scope > li.aparte-place__row')).toHaveLength(2);
        expect(card.querySelector('.aparte-place__media--thumb img')).not.toBeNull();
        expect(card.querySelector('.aparte-place__action')).toBeNull();
        expect(texts(card, '.aparte-place__row .aparte-place__category')).toEqual(['Trattoria', 'Café']);
        const one = draw(call('resolved', HOTEL));
        expect(one.querySelector('ul')).toBeNull();
        expect(one.querySelector(':scope > div.aparte-place__row')).not.toBeNull();
        expect(text(one, '.aparte-place__state')).toBe('Open');
    });

    it('draws the detail with its ways in, the week from today, and the tags', () => {
        setup({ variant: 'detail' });
        const card = draw(call('resolved', TRATTORIA));
        expect(card.querySelector('.aparte-place--detail')).not.toBeNull();
        expect(texts(card, '.aparte-place__action')).toEqual(['Directions', 'Call', 'Website']);
        const info = card.querySelector('ul.aparte-place__info')!;
        expect(info.querySelectorAll('li')).toHaveLength(3);
        expect(info.querySelector('a[href="tel:+33320000000"]')!.textContent).toBe('+33 3 20 00 00 00');
        expect(info.querySelector('a[href="https://enzo.example/"]')!.textContent).toBe('enzo.example');
        const table = card.querySelector('table.aparte-place__hours')!;
        expect(text(table, 'caption')).toBe('Hours');
        const rows = [...table.querySelectorAll('tbody tr')];
        expect(rows).toHaveLength(7);
        expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
        expect(rows[0]!.getAttribute('aria-current')).toBe('date');
        expect(rows[1]!.hasAttribute('aria-current')).toBe(false);
        expect(rows[0]!.querySelector('th')!.getAttribute('scope')).toBe('row');
        expect(rows[0]!.querySelector('td')!.textContent).toMatch(/^9\sAM–12\sPM, 2\sPM–10\sPM$/u);
        expect(rows[2]!.hasAttribute('data-closed')).toBe(true);
        expect(rows[2]!.querySelector('td')!.textContent).toBe('Closed');
        expect(rows[4]!.querySelector('td')!.textContent).toMatch(/^6\sPM–2\sAM$/u);
        expect(texts(card, '.aparte-place__tags .aparte-tag__label')).toEqual(['Terrace', 'Vegan options']);
    });

    it('starts the week on today, and spells a 24-hour day', () => {
        setup({ variant: 'detail', now: () => at(SUN, 12) });
        const card = draw(call('resolved', { name: 'Night shop', hours: { periods: [{ open: { day: 0, time: '0000' } }] } }));
        const rows = [...card.querySelectorAll('tbody tr')];
        expect(rows[0]!.querySelector('th')!.textContent).toBe('Sunday');
        expect(rows.every((r) => r.querySelector('td')!.textContent === 'Open 24 hours')).toBe(true);
        expect(card.querySelector('.aparte-place__info')).toBeNull();
    });

    it('lays several places out as tiles in detail too', () => {
        setup({ variant: 'detail' });
        expect(draw(call('resolved', [TRATTORIA, CAFE])).querySelectorAll('.aparte-place--tile')).toHaveLength(2);
    });

    it('picks a variant per result, and reads an unknown name as the default', () => {
        setup({ variant: (d) => (d.places.length > 1 ? 'compact' : 'detail') });
        expect(draw(call('resolved', TRATTORIA)).dataset.variant).toBe('detail');
        expect(draw(call('resolved', [TRATTORIA, CAFE])).dataset.variant).toBe('compact');
        stop();
        setup({ variant: 'nope' as never });
        expect(draw(call('resolved', TRATTORIA)).dataset.variant).toBe('card');
    });

    it('draws a skeleton in the shape of each variant', () => {
        setup({ variant: 'compact' });
        expect(draw(call('pending')).querySelector('.aparte-place__sk-thumb')).not.toBeNull();
        stop();
        setup({ variant: 'detail' });
        expect(draw(call('pending')).querySelector('.aparte-place__sk-hours')).not.toBeNull();
    });

    it('falls back to the placeholder when the photo fails to load', () => {
        setup();
        const card = draw(call('resolved', TRATTORIA));
        const media = card.querySelector('.aparte-place__media')!;
        expect(media.hasAttribute('data-empty')).toBe(false);
        media.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(media.querySelector('img')).toBeNull();
        expect(media.hasAttribute('data-empty')).toBe(true);
        expect(media.querySelector('.aparte-place__marker')).not.toBeNull();
    });

    it('draws a price tier with its own sign, a text price as it is, and the app\'s sign', () => {
        setup({ currencySymbol: '€' });
        expect(text(draw(call('resolved', { name: 'A', priceLevel: 3 })), '.aparte-place__price-on')).toBe('€€€');
        expect(text(draw(call('resolved', { name: 'B', price_level: '££££' })), '.aparte-place__price-on')).toBe('££££');
        expect(draw(call('resolved', { name: 'B', price_level: '££££' })).querySelector('.aparte-place__price-off')).toBeNull();
        expect(text(draw(call('resolved', { name: 'C', price: '€10–20' })), '.aparte-place__price')).toBe('€10–20');
    });
});

describe('the place card as a segment', () => {
    it('draws a card segment, and its fallback sentence says the same', () => {
        stop = setupPlaceCard({ now: () => at(MON, 19) });
        const segment = placeCard.segment([TRATTORIA, { name: 'Bare' }], { variant: 'compact' });
        expect(segment.fallback).toBe('Trattoria Da Enzo — 4.6/5 (1,284), 12 Rue de la Paix, Lille\nBare');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('place');
        expect(out.dataset.variant).toBe('compact');
        expect(out.querySelectorAll('li.aparte-place__row')).toHaveLength(2);
        expect(placeCard.segment({ title: 'Tonight', places: [CAFE] }).fallback).toBe('Tonight:\nCafé Méert — 4.4/5, 27 Rue Esquermoise');
        expect(placeCard.segment({ nothing: true }).fallback).toBeUndefined();
    });

    it('stops drawing card segments once unplugged', () => {
        const off = setupPlaceCard();
        expect(getSegmentRenderer('card')).toBeTruthy();
        off();
        expect(getSegmentRenderer('card')?.type).not.toBe('card');
    });
});

describe('reading the data', () => {
    it('reads the field names of the usual APIs', () => {
        const google = readPlaces({ results: [{
            displayName: { text: 'Le Comptoir' },
            primaryTypeDisplayName: { text: 'Bistro' },
            formattedAddress: '9 Carrefour de l’Odéon, Paris',
            userRatingCount: '2100',
            rating: 4.3,
            priceLevel: 'PRICE_LEVEL_EXPENSIVE',
            nationalPhoneNumber: '01 44 27 07 97',
            websiteUri: 'https://comptoir.example',
            googleMapsUri: 'https://maps.google.com/?cid=1',
            location: { latitude: 48.85, longitude: 2.34 },
            regularOpeningHours: { openNow: true, periods: [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } }] },
            photos: [{ name: 'places/x/photos/y' }],
            place_id: 'ChIJ1',
            utcOffsetMinutes: 60,
        }] })!;
        expect(google.places[0]).toMatchObject({
            name: 'Le Comptoir', category: 'Bistro', kind: 'restaurant', address: '9 Carrefour de l’Odéon, Paris',
            reviewCount: 2100, rating: 4.3, price: { level: 3 }, phone: '01 44 27 07 97',
            website: 'https://comptoir.example/', url: 'https://maps.google.com/?cid=1',
            coordinates: { lat: 48.85, lng: 2.34 }, openNow: true, placeId: 'ChIJ1', utcOffset: 60,
            hours: [{ day: 1, start: 720, end: 1380 }],
        });
        expect(google.places[0]!.image).toBeUndefined();

        const legacy = readPlaces({ candidates: [{
            name: 'Old Pub', types: ['bar', 'point_of_interest'], formatted_address: '1 High St', user_ratings_total: 87,
            price_level: 1, geometry: { location: { lat: 51.5, lng: -0.12 } }, formatted_phone_number: '020 7946 0000',
            opening_hours: { open_now: false, weekday_text: ['Monday: 5:00 PM – 11:00 PM'] }, photo: { url: 'https://x.example/p.jpg' },
        }] })!.places[0]!;
        expect(legacy).toMatchObject({ kind: 'bar', address: '1 High St', reviewCount: 87, price: { level: 1 }, coordinates: { lat: 51.5, lng: -0.12 }, openNow: false, image: 'https://x.example/p.jpg' });
        expect(legacy.hours).toEqual([{ day: 1, start: 1020, end: 1380 }]);

        const yelp = readPlaces([{ title: 'Yelp spot', categories: [{ alias: 'gyms', title: 'Gyms' }], review_count: 12, rating: 9, price: '$$', distance: '12 min walk', lat: 1, lon: 2, tags: ['A', 'B', 'C', 'D', 'E', 'x'.repeat(40)] }])!.places[0]!;
        expect(yelp).toMatchObject({ name: 'Yelp spot', category: 'Gyms', kind: 'gym', rating: 4.5, price: { level: 2, symbol: '$' }, distanceText: '12 min walk', coordinates: { lat: 1, lng: 2 }, tags: ['A', 'B', 'C', 'D'] });
    });

    it('chooses a kind from the category, then the types in order', () => {
        const kind = (p: object) => readPlaces({ name: 'x', ...p })!.places[0]!.kind;
        expect(kind({ types: ['cafe', 'food', 'store'] })).toBe('cafe');
        expect(kind({ types: ['point_of_interest', 'lodging'] })).toBe('hotel');
        expect(kind({ category: 'Wine bar' })).toBe('bar');
        expect(kind({ category: 'Musée' })).toBe('museum');
        expect(kind({ types: ['parking'] })).toBe('place');
        expect(kind({ types: ['park'] })).toBe('park');
        expect(kind({ types: ['pharmacy'] })).toBe('pharmacy');
        expect(kind({ types: ['book_store'] })).toBe('shop');
    });

    it('keeps only what it can trust', () => {
        const p = readPlaces({ name: 'x', rating: 12, reviewCount: -3, distance: -1, coordinates: { lat: 200, lng: 0 }, priceLevel: 0, utcOffset: 5000, image: '//cdn.example/a.jpg', website: 'not a site', openNow: 'yes' })!.places[0]!;
        expect(p.price).toBeUndefined();
        expect(p).toMatchObject({ rating: undefined, reviewCount: undefined, distance: undefined, coordinates: undefined, utcOffset: undefined, image: 'https://cdn.example/a.jpg', website: undefined, openNow: undefined });
        expect(readPlaces({ name: 'x', priceLevel: 'PRICE_LEVEL_FREE' })!.places[0]!.price).toBeUndefined();
        expect(readPlaces({ name: 'x', priceLevel: 'a very long price description indeed' })!.places[0]!.priceText).toBeUndefined();
        // A path on the app's own site is not the tool's to ask for: it would be fetched on render.
        expect(readPlaces({ name: 'x', image: '/img/a.jpg' })!.places[0]!.image).toBeUndefined();
        expect(readPlaces(null)).toBeNull();
        expect(readPlaces('Lille')).toBeNull();
        expect(readPlaces({ places: [] })).toBeNull();
        expect(readPlaces([{ name: '' }, 3])).toBeNull();
    });

    it('shows a distance in metres, then kilometres', () => {
        setup({ variant: 'compact' });
        const shown = (distance: number) => text(draw(call('resolved', { name: 'x', distance })), '.aparte-place__distance');
        expect(shown(42.4)).toBe('42 m');
        expect(shown(856)).toBe('860 m');
        expect(shown(1250)).toBe('1.3 km');
        expect(shown(23_400)).toBe('23 km');
    });
});

describe('the hours, as the usual sources write them', () => {
    /** A Yelp Fusion business, as `/v3/businesses/{id}` returns it: `day` 0 is MONDAY. */
    const YELP = {
        id: 'four-barrel', name: 'Four Barrel Coffee', image_url: 'https://s3-media.fl.yelpcdn.com/bphoto/x/o.jpg',
        url: 'https://www.yelp.com/biz/four-barrel-coffee-san-francisco', review_count: 1738, rating: 4, price: '$',
        phone: '+14152520800', display_phone: '(415) 252-0800', is_closed: false, distance: 1604.2,
        categories: [{ alias: 'coffee', title: 'Coffee & Tea' }],
        coordinates: { latitude: 37.7670169, longitude: -122.42184 },
        location: { address1: '375 Valencia St', city: 'San Francisco', zip_code: '94103', display_address: ['375 Valencia St', 'San Francisco, CA 94103'] },
        hours: [{
            hour_type: 'REGULAR', is_open_now: true,
            open: [
                { is_overnight: false, start: '0700', end: '2000', day: 0 },
                { is_overnight: true, start: '1800', end: '0200', day: 4 },
                { is_overnight: false, start: '0800', end: '1600', day: 6 },
            ],
        }],
    };

    it("reads Yelp's hours (its week starts on Monday), whether it is open now, and its address", () => {
        const place = readPlaces(YELP)!.places[0]!;
        expect(place.hours).toEqual([{ day: 0, start: 480, end: 960 }, { day: 1, start: 420, end: 1200 }, { day: 5, start: 1080, end: 1560 }]);
        expect(place.openNow).toBe(true);
        expect(place.address).toBe('375 Valencia St, San Francisco, CA 94103');
        expect(place).toMatchObject({ category: 'Coffee & Tea', kind: 'cafe', price: { level: 1, symbol: '$' }, coordinates: { lat: 37.7670169, lng: -122.42184 } });
        // Its other hour types (special hours) do not mix into the regular week.
        const both = readPlaces({ ...YELP, hours: [{ hour_type: 'HAPPY_HOUR', open: [{ start: '1600', end: '1800', day: 2 }] }, ...YELP.hours] })!.places[0]!;
        expect(both.hours).toEqual(place.hours);
    });

    it('reads a range that ends at 24h as a range, and only a bare "24 hours" as the whole day', () => {
        expect(readHours({ sat: '18h-24h' })).toEqual([{ day: 6, start: 1080, end: 1440 }]);
        expect(readHours({ fri: '0h-24h' })).toEqual([{ day: 5, start: 0, end: 1440 }]);
        expect(readHours({ sun: 'Ouvert 24h/24', mon: 'Open 24 hours' })).toEqual([{ day: 0, start: 0, end: 1440 }, { day: 1, start: 0, end: 1440 }]);
    });

    it('gives a start without AM/PM the meridiem its end has, when that keeps it before the end', () => {
        // Google writes a shared meridiem once: "5:00 – 10:00 PM" is five in the evening.
        expect(readHours({ weekday_text: ['Monday: 11:30 AM – 2:30 PM, 5:00 – 10:00 PM'] }))
            .toEqual([{ day: 1, start: 690, end: 870 }, { day: 1, start: 1020, end: 1320 }]);
        // The same with the narrow spaces Google's recent responses carry.
        expect(readHours({ weekday_text: ['Tuesday: 11:30 AM – 2:30 PM, 5:00 – 10:00 PM'] }))
            .toEqual([{ day: 2, start: 690, end: 870 }, { day: 2, start: 1020, end: 1320 }]);
        // "9:00 – 5:00 PM" is a day's work: nine in the evening would come after five.
        expect(readHours({ wed: '9:00 – 5:00 PM' })).toEqual([{ day: 3, start: 540, end: 1020 }]);
    });

    it("reads a Google period with no close as always open only where Google says so: Sunday at 00:00", () => {
        expect(placeStatus({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }, at(MON, 3))).toEqual({ open: true });
        // Anywhere else, no close is midnight, as in the plain `{ day, open }` shape — not the whole week.
        expect(readHours({ periods: [{ open: { day: 2, time: '0900' } }] })).toEqual([{ day: 2, start: 540, end: 1440 }]);
    });

    it("prefers Google's current hours (holidays included) to its regular week", () => {
        setup();
        // Monday is a holiday: the current week has Tuesday only.
        const card = draw(call('resolved', {
            name: 'Bistro',
            regularOpeningHours: { periods: [1, 2].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 22, minute: 0 } })) },
            currentOpeningHours: { openNow: false, periods: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 22, minute: 0 } }] },
        }));
        expect(text(card, '.aparte-place__state')).toBe('Closed');
        expect(text(card, '.aparte-place__next')).toBe('Opens tomorrow at 9 AM');
        // Current hours with no periods still give their answer, and the regular week its hours.
        const p = readPlaces({ name: 'x', regularOpeningHours: { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] }, currentOpeningHours: { openNow: false } })!.places[0]!;
        expect(p).toMatchObject({ openNow: false, hours: [{ day: 1, start: 540, end: 1020 }] });
    });

    it("keeps the place's clock and the closing time right across a daylight-saving change in the reader's zone", () => {
        const zone = process.env['TZ'];
        process.env['TZ'] = 'Europe/Paris';
        try {
            // Paris leaves summer time at 01:00 UTC on Sunday 25 October 2026. At 01:30 UTC a
            // place on UTC reads 01:30: it opens at 02:00, it is not already open.
            const now = new Date(Date.UTC(2026, 9, 25, 1, 30));
            stop = setupPlaceCard({ tool: 'find_places', now: () => now });
            const card = draw(call('resolved', { name: 'Harbour', utcOffset: 0, hours: [{ day: 0, open: '02:00', close: '18:00' }] }));
            expect(text(card, '.aparte-place__next')).toBe('Opens at 2 AM');
            // On the reader's own clock: Saturday 23:00 (summer time), closing at 04:00 (winter time).
            const status = placeStatus([{ day: 6, open: '18:00', close: '04:00' }], new Date(2026, 9, 24, 23, 0))!;
            expect(status.open).toBe(true);
            expect([status.changesAt!.getDate(), status.changesAt!.getHours()]).toEqual([25, 4]);
        } finally {
            if (zone === undefined) delete process.env['TZ'];
            else process.env['TZ'] = zone;
        }
    });
});

describe('the phone link and the photo', () => {
    it('keeps the leading + after a label, and leaves an extension out of the number', () => {
        expect(phoneUrl('Tel: +33 1 23 45 67 89')).toBe('tel:+33123456789');
        expect(phoneUrl('+1 (415) 252-0800 ext. 12')).toBe('tel:+14152520800');
        expect(phoneUrl('+1 415 252 0800 x12')).toBe('tel:+14152520800');
        expect(phoneUrl('(555) 123-4567 #3')).toBe('tel:5551234567');
    });

    it('sends no referrer with the photo, like the other cards', () => {
        setup();
        expect(draw(call('resolved', TRATTORIA)).querySelector('img.aparte-place__img')!.getAttribute('referrerpolicy')).toBe('no-referrer');
    });
});

describe('the map behind a place (mapTiles)', () => {
    const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const STUDIO = { name: 'Demo studio', address: '12 rue de la Paix, Paris', coordinates: { lat: 48.8686, lng: 2.331 } };
    const tiles = (card: Element) => [...card.querySelectorAll('img.aparte-place__tile')];

    it('fetches nothing unless the app gives tiles: the drawn map, as before', () => {
        setup();
        const card = draw(call('resolved', STUDIO));
        expect(tiles(card)).toHaveLength(0);
        expect(card.querySelector('.aparte-place__media')!.hasAttribute('data-map')).toBe(false);
    });

    it('lays nine tiles around the place, the place under the marker, with the provider\'s credit', () => {
        setup({ mapTiles: OSM, mapAttribution: '© OpenStreetMap contributors' });
        const card = draw(call('resolved', STUDIO));
        const media = card.querySelector('.aparte-place__media')!;
        expect(media.hasAttribute('data-map')).toBe(true);
        const srcs = tiles(card).map((t) => t.getAttribute('src'));
        expect(srcs).toHaveLength(9);
        // The middle one is the tile the place is in (zoom 16 by default).
        expect(srcs[4]).toBe('https://tile.openstreetmap.org/16/33192/22542.png');
        expect(srcs[0]).toBe('https://tile.openstreetmap.org/16/33191/22541.png');
        const layer = card.querySelector<HTMLElement>('.aparte-place__map')!;
        expect(layer.style.getPropertyValue('--aparte-place-map-x')).toBe('344px');
        expect(layer.style.getPropertyValue('--aparte-place-map-y')).toBe('493px');
        expect(layer.getAttribute('aria-hidden')).toBe('true');
        expect(text(card, '.aparte-place__credit')).toBe('© OpenStreetMap contributors');
        // Tiles keep the page's referrer: OpenStreetMap's policy asks for one.
        expect(tiles(card)[4]!.hasAttribute('referrerpolicy')).toBe(false);
    });

    it('wraps the world east and west, and leaves no tile above the pole', () => {
        setup({ mapTiles: OSM, mapZoom: 1 });
        const srcs = tiles(draw(call('resolved', { name: 'Null Island', coordinates: { lat: 0, lng: 0 } }))).map((t) => t.getAttribute('src'));
        expect(srcs.slice(0, 3)).toEqual(['https://tile.openstreetmap.org/1/0/0.png', 'https://tile.openstreetmap.org/1/1/0.png', 'https://tile.openstreetmap.org/1/0/0.png']);
        expect(srcs.slice(6)).toEqual([null, null, null]);
    });

    it('keeps a photo over the map, and the drawn map for a place without coordinates', () => {
        setup({ mapTiles: OSM });
        expect(tiles(draw(call('resolved', { ...STUDIO, image: 'https://example.com/front.jpg' })))).toHaveLength(0);
        document.body.innerHTML = '';
        expect(tiles(draw(call('resolved', { name: 'Somewhere' })))).toHaveLength(0);
    });

    it('ignores tiles that are not an http(s) address with {z}, {x} and {y}', () => {
        for (const mapTiles of ['javascript:alert(1)//{z}/{x}/{y}', 'https://tiles.example/{z}/{x}.png']) {
            stop();
            setup({ mapTiles });
            expect(tiles(draw(call('resolved', STUDIO)))).toHaveLength(0);
            document.body.innerHTML = '';
        }
    });

    it('brings the drawn map back when a tile fails', () => {
        setup({ mapTiles: OSM, mapAttribution: '© OSM' });
        const card = draw(call('resolved', STUDIO));
        tiles(card)[2]!.dispatchEvent(new Event('error'));
        expect(tiles(card)).toHaveLength(0);
        expect(card.querySelector('.aparte-place__credit')).toBeNull();
        expect(card.querySelector('.aparte-place__media')!.hasAttribute('data-map')).toBe(false);
        expect(card.querySelector('.aparte-place__marker')).not.toBeNull();
    });
});
