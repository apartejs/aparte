import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupOrderCard, orderCard, readOrder, readWhen, nightsOf, type OrderData, type OrderVariant } from './index.js';

const ORDER = {
    reference: '1042',
    status: 'shipped',
    date: '2026-10-28T10:15:00',
    currency: 'EUR',
    items: [
        { title: 'Trail runner 3', subtitle: 'Blue · 42', image: 'https://cdn.example.com/shoe.jpg', quantity: 1, price: 89.9 },
        { title: 'Wool socks', quantity: 2, price: 12 },
    ],
    discount: 10,
    shipping: 0,
    tax: 4.5,
    payment: 'Visa •••• 4242',
    shippingAddress: 'Paul R.\n12 rue de la Paix\n59000 Lille',
    customer: { first_name: 'Paul', last_name: 'R.', email: 'paul@example.com' },
    delivery: { estimate: '2026-11-03', carrier: 'Colissimo', trackingNumber: '6A123', trackingUrl: 'https://track.example.com/6A123' },
    facts: [{ label: 'Gift wrap', value: 'Yes' }],
    url: 'https://shop.example.com/orders/1042',
};

const DINNER = {
    kind: 'booking',
    title: 'Dinner at Enzo',
    reference: 'K7F2Q',
    status: 'confirmed',
    booking: { start: '2026-11-06T19:30', end: '2026-11-06T22:00', location: 'Trattoria Da Enzo, Lille', guests: 2 },
};

const STAY = {
    kind: 'booking',
    reference: 'H-88',
    booking: { start: '2026-11-06', end: '2026-11-08', location: { name: 'Hôtel Lumière', address: '3 place du Théâtre' }, guests: 1 },
    total: 240,
    currency: 'EUR',
    facts: { Room: 'Deluxe', Breakfast: 'Included', Parking: 'No' },
};

const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Item ${i + 1}`, price: 1 }));

let stop: () => void = () => {};
beforeEach(() => {
    // Saturday 31 October 2026: the fixtures' dates are this year, so none writes its year.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 31, 12));
    aparteGlobalConfig.extendLocale({ tag: 'en-US' });
});
afterEach(() => {
    stop();
    vi.useRealTimers();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { order_id: '1042' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'get_order', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = aparteGlobalConfig.getToolRenderer('get_order')!.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
/** `Intl` spaces its ranges and its "PM" with thin and narrow no-break spaces: compare on plain ones. */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[\u2009\u202F\u00A0]/g, ' ');

function variant(v: OrderVariant) {
    stop();
    stop = setupOrderCard({ tool: 'get_order', variant: v });
}

describe('the order card on a tool', () => {
    beforeEach(() => {
        stop = setupOrderCard({ tool: 'get_order' });
    });

    it('draws a receipt: header, lines, totals, then payment, delivery, address and the facts', () => {
        const card = draw(call('resolved', ORDER));
        expect(card.dataset.card).toBe('order');
        expect(card.dataset.variant).toBe('receipt');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Order 1042');

        expect(text(card, '.aparte-order__head .aparte-order__title')).toBe('Order #1042');
        expect(text(card, '.aparte-order__date')).toBe('Placed Oct 28, 2026');
        expect(card.querySelector('.aparte-order__date')!.getAttribute('datetime')).toMatch(/^2026-10-28T/);
        const pill = card.querySelector('.aparte-order__status')!;
        expect(pill.textContent).toBe('Shipped');
        expect(pill.getAttribute('data-status')).toBe('shipped');
        expect(pill.classList.contains('aparte-badge--info')).toBe(true);

        const list = card.querySelector('.aparte-order__lines')!;
        expect(list.getAttribute('role')).toBe('list');
        expect(list.getAttribute('aria-label')).toBe('Items');
        expect(list.hasAttribute('data-thumbs')).toBe(true);
        expect(texts(card, '.aparte-order__line-title')).toEqual(['Trail runner 3', 'Wool socks']);
        expect(texts(card, '.aparte-order__line-variant')).toEqual(['Blue · 42']);
        // "× 2" and the unit price only where the quantity is not one.
        expect(texts(card, '.aparte-order__qty').map(plain)).toEqual(['× 2']);
        expect(texts(card, '.aparte-order__line-each')).toEqual(['€12.00 each']);
        expect(texts(card, '.aparte-order__line-total')).toEqual(['€89.90', '€24.00']);
        const image = card.querySelector<HTMLImageElement>('.aparte-order__image')!;
        expect(image.getAttribute('alt')).toBe('Trail runner 3');
        expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
        // The sock has no photo, but the list has thumbnails: it gets the parcel.
        expect(card.querySelectorAll('.aparte-order__thumb')[1]!.hasAttribute('data-empty')).toBe(true);

        expect(texts(card, '.aparte-order__sum-label')).toEqual(['Subtotal', 'Discount', 'Shipping', 'Tax', 'Total']);
        expect(texts(card, '.aparte-order__sum-value')).toEqual(['€113.90', '−€10.00', 'Free', '€4.50', '€108.40']);
        expect(card.querySelector('.aparte-order__sum--free')).not.toBeNull();

        expect(texts(card, '.aparte-order__info-label-text')).toEqual(['Payment', 'Estimated delivery', 'Delivery address', 'Customer', 'Gift wrap']);
        expect(text(card, '.aparte-order__estimate')).toBe('Tue, Nov 3');
        expect(text(card, '.aparte-order__carrier')).toBe('Colissimo · 6A123');
        expect(text(card, '.aparte-order__track')).toBe('Track');
        expect(texts(card, '.aparte-order__multiline')).toEqual(['Paul R.\n12 rue de la Paix\n59000 Lille', 'Paul R.\npaul@example.com']);
        expect(text(card, '.aparte-order__foot .aparte-order__view')).toBe('View order');
    });

    it('shows a skeleton, with the number the call names, while it runs', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('Order 1042 — Loading');
        expect(text(card, '.aparte-order__title')).toBe('Order #1042');
        expect(card.querySelectorAll('.aparte-order__line--skeleton')).toHaveLength(3);
        expect(card.querySelectorAll('.aparte-order__sum')).toHaveLength(2);

        const unnamed = draw(call('pending', undefined, {}));
        expect(unnamed.getAttribute('aria-label')).toBe('Order — Loading');
        expect(unnamed.querySelector('.aparte-order__sk-title')).not.toBeNull();
        const booking = draw(call('pending', undefined, { booking_id: 'K7F2Q' }));
        expect(booking.getAttribute('aria-label')).toBe('Booking K7F2Q — Loading');
        expect(draw(call('pending', undefined, { kind: 'booking' })).getAttribute('aria-label')).toBe('Booking — Loading');
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-order__head')).toBeNull();
        expect(failed.textContent).toContain('Order 1042');
    });

    it('says it is unavailable, and warns once, when the result has nothing it can draw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { items: [{ price: 12 }] }));
        draw(call('resolved', 'no order'));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_order')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', ORDER));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.getAttribute('aria-label')).toBe('Order 1042');
        expect(text(card, '.aparte-order__sum--total .aparte-order__sum-value')).toBe('€108.40');
    });

    it('relabels words, prices and dates in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_order')!;
        const card = draw(call('resolved', { ...ORDER, items: lines(8).map((l, i) => ({ ...l, quantity: i ? 1 : 3 })) }));
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', ORDER));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(card.getAttribute('aria-label')).toBe('Commande 1042');
        expect(text(card, '.aparte-order__head .aparte-order__title')).toBe('Commande #1042');
        expect(text(card, '.aparte-order__date')).toMatch(/^Passée le 28 oct\. 2026$/u);
        expect(text(card, '.aparte-order__status')).toBe('Expédiée');
        expect(texts(card, '.aparte-order__sum-label')).toEqual(['Sous-total', 'Remise', 'Livraison', 'Taxes', 'Total']);
        expect(plain(text(card, '.aparte-order__sum--total .aparte-order__sum-value'))).toBe('4,50 €');
        expect(plain(text(card, '.aparte-order__sum--discount .aparte-order__sum-value'))).toBe('−10,00 €');
        expect(text(card, '.aparte-order__sum--free .aparte-order__sum-value')).toBe('Gratuite');
        expect(text(card, '.aparte-order__more-text')).toBe('et 2 de plus');
        expect(plain(text(card, '.aparte-order__line-each'))).toBe('1,00 € l’unité');
        expect(text(card, '.aparte-order__estimate')).toMatch(/^mar\. 3 nov\.$/u);
        expect(text(card, '.aparte-order__track')).toBe('Suivre');
        expect(text(card, '.aparte-order__view')).toBe('Voir la commande');
        expect(card.querySelector('.aparte-order__lines')!.getAttribute('aria-label')).toBe('Articles');
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsOrderStatus_shipped: 'En route' });
        expect(text(draw(call('resolved', ORDER)), '.aparte-order__status')).toBe('En route');
    });

    it('never parses a value from the tool as markup, and draws no unsafe link', () => {
        const card = draw(call('resolved', {
            title: '<img src=x onerror="window.__pwned=1">',
            status: '<b>odd</b>',
            items: [{ title: '<script>window.__pwned=1</script>', image: 'javascript:alert(1)', price: 1 }],
            payment: '<i>card</i>',
            facts: [{ label: '<u>x</u>', value: '<svg onload=alert(1)>' }],
            url: 'javascript:alert(1)',
            delivery: { carrier: 'X', trackingUrl: 'javascript:alert(1)' },
        }));
        expect(card.querySelector('img, b, i, u, script, svg:not(.aparte-rich-card__glyph svg)')).toBeNull();
        expect(text(card, '.aparte-order__head .aparte-order__title')).toContain('<img');
        expect(text(card, '.aparte-order__line-title')).toContain('<script>');
        expect(card.querySelector('a')).toBeNull();
        expect(card.querySelector('button')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('hides a photo that fails to load, showing the parcel under it', () => {
        const card = draw(call('resolved', ORDER));
        const image = card.querySelector<HTMLImageElement>('.aparte-order__image')!;
        image.dispatchEvent(new Event('error'));
        expect(image.hidden).toBe(true);
        expect(card.querySelector('.aparte-order__thumb')!.hasAttribute('data-empty')).toBe(true);
    });

    it('reports Track and View through the card action event, with the order as its data', () => {
        const card = draw(call('resolved', ORDER));
        const seen: Array<{ id?: string; url?: string; data: unknown }> = [];
        const listen = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            seen.push({ id: detail.action.id, url: detail.action.url, data: detail.data });
            e.preventDefault();
        };
        document.addEventListener('aparte-card-action', listen);
        card.querySelector<HTMLButtonElement>('.aparte-order__track')!.click();
        card.querySelector<HTMLButtonElement>('.aparte-order__view')!.click();
        document.removeEventListener('aparte-card-action', listen);
        expect(seen.map((s) => s.id)).toEqual(['track', 'view']);
        expect(seen[0]!.url).toBe('https://track.example.com/6A123');
        expect(seen[1]!.data).toMatchObject({ reference: '1042', total: 108.4 });
    });

    it('puts the lines past six behind "and n more", and says how many past fifty were not kept', () => {
        const nine = draw(call('resolved', { reference: '1', items: lines(9) }));
        expect(nine.querySelectorAll(':scope .aparte-order__items > .aparte-order__lines > li')).toHaveLength(6);
        const more = nine.querySelector('details.aparte-order__more')!;
        expect(text(more, 'summary')).toBe('and 3 more');
        expect(more.querySelectorAll('li')).toHaveLength(3);
        expect(more.querySelector('.aparte-order__dropped')).toBeNull();
        // No photo anywhere: no thumbnail column.
        expect(nine.querySelector('.aparte-order__lines')!.hasAttribute('data-thumbs')).toBe(false);
        expect(nine.querySelector('.aparte-order__thumb')).toBeNull();

        const many = draw(call('resolved', { reference: '2', items: lines(60) }));
        expect(text(many, '.aparte-order__more-text')).toBe('and 54 more');
        expect(many.querySelectorAll('.aparte-order__more li')).toHaveLength(44);
        expect(text(many, '.aparte-order__dropped')).toBe('and 10 more');
        // The totals count every line the tool gave, not the fifty kept.
        expect(text(many, '.aparte-order__sum--total .aparte-order__sum-value')).toBe('60');

        expect(draw(call('resolved', { reference: '3', items: lines(6) })).querySelector('details')).toBeNull();
    });

    it('draws a total alone, without a subtotal that would only repeat it', () => {
        const card = draw(call('resolved', { reference: '9', total: 20, currency: 'USD', items: [{ title: 'Mug', price: 20 }] }));
        expect(texts(card, '.aparte-order__sum-label')).toEqual(['Total']);
        expect(card.querySelector('.aparte-order__infos, .aparte-order__foot')).toBeNull();
    });
});

describe('a booking', () => {
    beforeEach(() => {
        stop = setupOrderCard({ tool: 'get_order' });
    });

    it('draws one evening as its leaf, its hours, where and for how many — no lines block', () => {
        const card = draw(call('resolved', { ...DINNER, date: '2026-10-30' }));
        expect(card.getAttribute('aria-label')).toBe('Dinner at Enzo');
        expect(text(card, '.aparte-order__head .aparte-order__title')).toBe('Dinner at Enzo');
        expect(text(card, '.aparte-order__date')).toBe('Booked Oct 30, 2026');
        expect(text(card, '.aparte-order__status')).toBe('Confirmed');
        expect(card.querySelector('.aparte-order__items')).toBeNull();
        expect(texts(card, '.aparte-order__leaf > span')).toEqual(['Nov', '6', 'Fri']);
        expect(text(card, '.aparte-order__day-name')).toBe('Friday, November 6');
        expect(plain(text(card, '.aparte-order__day-hours'))).toMatch(/^7:30\s?[–-]\s?10:00 PM$/);
        expect(texts(card, '.aparte-order__place-value')).toEqual(['Trattoria Da Enzo, Lille', '2 guests']);
        expect(texts(card, '.aparte-order__place-label .aparte-sr-only')).toEqual(['Where', 'Guests']);
    });

    it('draws a stay as two leaves with the nights between them', () => {
        const card = draw(call('resolved', STAY));
        expect(text(card, '.aparte-order__head .aparte-order__title')).toBe('Booking H-88');
        expect(card.querySelectorAll('.aparte-order__leaf')).toHaveLength(2);
        expect(texts(card, '.aparte-order__stay-side .aparte-sr-only')).toEqual(['Start', 'End']);
        expect(text(card, '.aparte-order__nights')).toBe('2 nights');
        // Days without a time say no time.
        expect(card.querySelector('.aparte-order__stay-time')).toBeNull();
        expect(texts(card, '.aparte-order__place-value')).toEqual(['Hôtel Lumière, 3 place du Théâtre', '1 guest']);
        expect(texts(card, '.aparte-order__info-label-text')).toEqual(['Room', 'Breakfast', 'Parking']);
    });

    it('gives a stay with check-in and check-out hours its times, and one night its singular', () => {
        const card = draw(call('resolved', { kind: 'booking', checkIn: '2026-11-06T15:00', checkOut: '2026-11-07T11:00' }));
        expect(text(card, '.aparte-order__nights')).toBe('1 night');
        expect(texts(card, '.aparte-order__stay-time').map(plain)).toEqual(['3:00 PM', '11:00 AM']);
    });

    it('gives a booking its own agreeing words', () => {
        aparteGlobalConfig.extendLocale({ tag: 'es-ES' });
        expect(text(draw(call('resolved', DINNER)), '.aparte-order__status')).toBe('Confirmada');
        expect(text(draw(call('resolved', { ...DINNER, kind: 'order' })), '.aparte-order__status')).toBe('Confirmado');
    });
});

describe('the compact variant', () => {
    beforeEach(() => variant('compact'));

    it('draws one row: kind, name linked to the page, "3 items · total", pill, chevron', () => {
        const card = draw(call('resolved', ORDER));
        const row = card.querySelector('.aparte-order__row')!;
        expect(row.hasAttribute('data-linked')).toBe(true);
        expect(row.querySelector('.aparte-order__kind')).not.toBeNull();
        const link = row.querySelector<HTMLAnchorElement>('.aparte-order__link')!;
        expect(link.textContent).toBe('Order #1042');
        expect(link.href).toBe('https://shop.example.com/orders/1042');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(texts(row, '.aparte-order__row-part')).toEqual(['3 items', '€108.40']);
        expect(text(row, '.aparte-order__status')).toBe('Shipped');
        expect(row.querySelector('.aparte-order__chevron')).not.toBeNull();
        expect(card.querySelector('.aparte-order__lines, .aparte-order__totals')).toBeNull();
    });

    it('has no link and no chevron without a page, and says a booking by its dates', () => {
        const card = draw(call('resolved', DINNER));
        expect(card.querySelector('a, .aparte-order__chevron')).toBeNull();
        expect(text(card, '.aparte-order__title')).toBe('Dinner at Enzo');
        const parts = texts(card, '.aparte-order__row-part').map(plain);
        expect(parts[0]).toMatch(/^Fri, Nov 6, 7:30\s?[–-]\s?10:00 PM$/);
        expect(parts[1]).toBe('2 guests');
        expect(text(draw(call('resolved', { reference: '7', items: [{ title: 'A' }] })), '.aparte-order__row-part')).toBe('1 item');
    });

    it('shows a one-row skeleton', () => {
        const card = draw(call('pending'));
        expect(card.querySelector('.aparte-order__row .aparte-order__title')!.textContent).toBe('Order #1042');
        expect(card.querySelector('.aparte-order__sk-pill')).not.toBeNull();
    });
});

describe('the confirmation variant', () => {
    beforeEach(() => variant('confirmation'));

    it("says the tool's own headline when it gives one, rather than the status's sentence", () => {
        const card = draw(call('resolved', { ...ORDER, status: 'processing', headline: 'Return started' }));
        expect(text(card, '.aparte-order__headline')).toBe('Return started');
        expect(readOrder({ ...ORDER, headline: '  ' })!.headline).toBeUndefined();
    });

    it("draws the seal, the status' headline, the number, the facts that matter and what to do next", () => {
        const card = draw(call('resolved', ORDER));
        const confirm = card.querySelector('.aparte-order__confirm')!;
        expect(confirm.getAttribute('data-tone')).toBe('success');
        const seal = confirm.querySelector('.aparte-order__seal')!;
        expect(seal.getAttribute('aria-hidden')).toBe('true');
        expect(seal.querySelector('.aparte-order__seal-mark')!.getAttribute('pathLength')).toBe('1');
        expect(text(confirm, '.aparte-order__headline')).toBe('Order shipped');
        expect(text(confirm, '.aparte-order__ref')).toBe('#1042');
        expect(confirm.querySelector('.aparte-order__status')).toBeNull();
        expect(texts(confirm, '.aparte-order__keyfact-label')).toEqual(['Total', 'Estimated delivery', 'Gift wrap']);
        expect(texts(confirm, '.aparte-order__keyfact-text')).toEqual(['€108.40', 'Tue, Nov 3', 'Yes']);
        expect(texts(confirm, '.aparte-order__keyfact-note')).toEqual(['3 items', 'Colissimo']);
        const buttons = [...confirm.querySelectorAll<HTMLButtonElement>('.aparte-order__confirm-actions button')];
        expect(buttons.map((b) => b.textContent)).toEqual(['View order', 'Track']);
        expect(buttons[0]!.classList.contains('aparte-btn--primary')).toBe(true);
    });

    it('says a booking by its name and number, when, where and for how many', () => {
        const card = draw(call('resolved', STAY));
        expect(text(card, '.aparte-order__headline')).toBe('Booking confirmed');
        expect(text(card, '.aparte-order__ref')).toBe('H-88');
        expect(texts(card, '.aparte-order__keyfact-label')).toEqual(['Total', 'When', 'Where', 'Guests', 'Room', 'Breakfast']);
        expect(plain(texts(card, '.aparte-order__keyfact-text')[1])).toMatch(/^Fri, Nov 6\s?[–-]\s?Sun, Nov 8$/);
        expect(texts(card, '.aparte-order__keyfact-note')).toEqual(['2 nights']);
        const dinner = draw(call('resolved', DINNER));
        expect(text(dinner, '.aparte-order__ref')).toBe('Dinner at Enzo · K7F2Q');
    });

    it('changes the seal and the headline with the status', () => {
        const cases: Array<[unknown, string, string]> = [
            [{ reference: '1', status: 'cancelled' }, 'danger', 'Order cancelled'],
            [{ reference: '1', status: 'failed' }, 'danger', 'Order failed'],
            [{ reference: '1', status: 'pending' }, 'info', 'Order placed'],
            [{ reference: '1', status: 'processing' }, 'info', 'Order being prepared'],
            [{ reference: '1', status: 'refunded' }, 'neutral', 'Order refunded'],
            [{ reference: '1', status: 'delivered' }, 'success', 'Order delivered'],
            [{ reference: '1' }, 'success', 'Order confirmed'],
            [{ kind: 'booking', reference: '1', status: 'shipped' }, 'success', 'Booking confirmed'],
            [{ kind: 'booking', reference: '1', status: 'processing' }, 'info', 'Booking requested'],
            [{ kind: 'booking', reference: '1', status: 'cancelled' }, 'danger', 'Booking cancelled'],
        ];
        for (const [data, tone, words] of cases) {
            const card = draw(call('resolved', data));
            expect(card.querySelector('.aparte-order__confirm')!.getAttribute('data-tone')).toBe(tone);
            expect(text(card, '.aparte-order__headline')).toBe(words);
        }
        // Words the card does not know: the headline stays plain, the pill says them.
        const odd = draw(call('resolved', { reference: '1', status: 'Awaiting customs' }));
        expect(text(odd, '.aparte-order__headline')).toBe('Order confirmed');
        expect(odd.querySelector('.aparte-order__status')!.getAttribute('data-status')).toBe('other');
        expect(text(odd, '.aparte-order__status')).toBe('Awaiting customs');
    });

    it('shows a seal-shaped skeleton', () => {
        const card = draw(call('pending'));
        expect(card.querySelector('.aparte-order__sk-seal')).not.toBeNull();
        expect(text(card, '.aparte-order__ref')).toBe('#1042');
        expect(draw(call('pending', undefined, {})).querySelector('.aparte-order__sk-ref')).not.toBeNull();
    });
});

describe('choosing a variant', () => {
    it('reads a function of the data, and falls back to the receipt for a name it lacks', () => {
        stop = setupOrderCard({ tool: 'get_order', variant: (d: OrderData) => (d.kind === 'booking' ? 'confirmation' : 'compact') });
        expect(draw(call('resolved', DINNER)).dataset.variant).toBe('confirmation');
        expect(draw(call('resolved', ORDER)).dataset.variant).toBe('compact');
        stop();
        stop = setupOrderCard({ tool: 'get_order', variant: 'nope' as OrderVariant });
        expect(draw(call('resolved', ORDER)).dataset.variant).toBe('receipt');
    });
});

describe('the order card as a segment', () => {
    it('draws a card segment, and its fallback says the order in one sentence', () => {
        stop = setupOrderCard();
        const segment = orderCard.segment(ORDER, { variant: 'compact' });
        expect(segment.fallback).toBe('Order 1042 — 3 items, total €108.40, shipped');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('order');
        expect(out.dataset.variant).toBe('compact');
        expect(out.querySelector('.aparte-order__row')).not.toBeNull();

        expect(plain(orderCard.segment(DINNER).fallback)).toMatch(/^Dinner at Enzo — Fri, Nov 6, 7:30\s?[–-]\s?10:00 PM, Trattoria Da Enzo, Lille, 2 guests, confirmed$/);
        expect(orderCard.segment({ reference: 'A1', status: 'On its way' }).fallback).toBe('Order A1 — On its way');
        expect(orderCard.segment({ title: 'Gift card' }).fallback).toBe('Gift card');
        expect(orderCard.segment({ nothing: 1 }).fallback).toBeUndefined();
    });
});

describe('reading the data', () => {
    it('reads its own shape, computing line totals, the subtotal and the total', () => {
        const data = readOrder(ORDER)!;
        expect(data.kind).toBe('order');
        expect(data.items[1]).toEqual({ title: 'Wool socks', quantity: 2, price: 12, total: 24 });
        expect(data.subtotal).toBeCloseTo(113.9);
        expect(data.total).toBeCloseTo(108.4);
        expect(data.itemCount).toBe(3);
        expect(data.lineCount).toBe(2);
        expect(data.delivery).toEqual({
            estimate: { from: { date: new Date(2026, 10, 3), allDay: true } },
            carrier: 'Colissimo', trackingNumber: '6A123', trackingUrl: 'https://track.example.com/6A123',
        });
    });

    it('reads a delivery estimate handed over as a Date, not as an empty range', () => {
        const day = new Date(2026, 10, 4);
        const data = readOrder({ items: [{ title: 'A', price: 10 }], delivery: { estimate: day, carrier: 'Colissimo' } })!;
        expect(data.delivery?.estimate).toMatchObject({ from: { date: day } });
    });

    it("keeps the tool's own total, and makes no subtotal from lines that lack a price", () => {
        expect(readOrder({ items: [{ title: 'A', price: 10 }], total: 7 })!.total).toBe(7);
        const data = readOrder({ items: [{ title: 'A', price: 10 }, { title: 'B' }] })!;
        expect(data.subtotal).toBeUndefined();
        expect(data.total).toBeUndefined();
        // A negative discount is the same discount; a fractional quantity counts as one line.
        const weighed = readOrder({ items: [{ title: 'Cheese', quantity: 0.5, price: 30 }, { title: 'Bread', price: 2 }], discount: '-5' })!;
        expect(weighed.discount).toBe(5);
        expect(weighed.total).toBe(12);
        expect(weighed.itemCount).toBe(2);
    });

    it('reads prices written as text, and the currency they are written in', () => {
        const data = readOrder({ items: [{ name: 'Lamp', unit_price: '1.299,00 €', qty: '2' }], shipping: '€ 4,90', tax: 'USD 3' })!;
        expect(data.currency).toBe('EUR');
        expect(data.items[0]).toMatchObject({ price: 1299, quantity: 2, total: 2598 });
        expect(data.shipping).toBe(4.9);
        expect(data.tax).toBe(3);
        expect(readOrder({ total: '$1,299.50' })!.total).toBe(1299.5);
        expect(readOrder({ total: '−€5' })!.total).toBe(-5);
        expect(readOrder({ total: 'free!', reference: 'x' })!.total).toBeUndefined();
    });

    it('reads a Shopify order', () => {
        const data = readOrder({
            id: 450789469, order_number: 1001, name: '#1001', created_at: '2026-10-20T09:00:00-04:00',
            currency: 'USD', financial_status: 'paid', fulfillment_status: 'fulfilled',
            line_items: [{ title: 'IPod Nano', variant_title: 'Pink', quantity: 1, price: '199.00' }],
            subtotal_price: '199.00', total_discounts: '0.00', total_tax: '11.94', total_price: '210.94',
            shipping_lines: [{ price: '0.00' }],
            shipping_address: { first_name: 'Bob', last_name: 'Norman', address1: 'Chestnut Street 92', city: 'Louisville', province_code: 'KY', zip: '40202', country: 'United States' },
            customer: { first_name: 'Bob', last_name: 'Norman', email: 'bob@example.com' },
            fulfillments: [{ tracking_company: 'UPS', tracking_numbers: ['1Z1'], tracking_urls: ['https://ups.example.com/1Z1'] }],
            order_status_url: 'https://shop.example.com/orders/abc',
        })!;
        expect(data.reference).toBe('1001');
        expect(data.status).toEqual({ status: 'shipped' });
        expect(data.items[0]).toEqual({ title: 'IPod Nano', subtitle: 'Pink', quantity: 1, price: 199, total: 199 });
        expect([data.subtotal, data.discount, data.shipping, data.tax, data.total]).toEqual([199, 0, 0, 11.94, 210.94]);
        expect(data.shippingAddress).toBe('Bob Norman\nChestnut Street 92\nLouisville, KY 40202\nUnited States');
        expect(data.customer).toBe('Bob Norman\nbob@example.com');
        expect(data.delivery).toEqual({ carrier: 'UPS', trackingNumber: '1Z1', trackingUrl: 'https://ups.example.com/1Z1' });
        expect(data.url).toBe('https://shop.example.com/orders/abc');
        expect(data.date).toBeInstanceOf(Date);
    });

    it("maps a shop's half-statuses only where they are plain", () => {
        const status = (r: Record<string, unknown>) => readOrder({ reference: '1', ...r })!.status;
        expect(status({ cancelled_at: '2026-10-01', financial_status: 'paid' })).toEqual({ status: 'cancelled' });
        expect(status({ financial_status: 'refunded' })).toEqual({ status: 'refunded' });
        expect(status({ financial_status: 'voided' })).toEqual({ status: 'cancelled' });
        expect(status({ fulfillment_status: 'delivered' })).toEqual({ status: 'delivered' });
        expect(status({ financial_status: 'paid' })).toEqual({ status: 'confirmed' });
        expect(status({ financial_status: 'pending' })).toEqual({ status: 'pending' });
        expect(status({ payment_status: 'unpaid' })).toEqual({ status: 'pending' });
        expect(status({ financial_status: 'partially_refunded', fulfillment_status: 'partial' })).toBeUndefined();
        expect(status({ status: 'on-hold' })).toEqual({ status: 'pending' });
        expect(status({ status: 'Completed' })).toEqual({ status: 'confirmed' });
        expect(status({ status: 'canceled' })).toEqual({ status: 'cancelled' });
        expect(status({ status: 'https://schema.org/OrderInTransit' })).toEqual({ status: 'shipped' });
        expect(status({ state: 'Awaiting customs' })).toEqual({ text: 'Awaiting customs' });
    });

    it('reads a WooCommerce order', () => {
        const data = readOrder({
            id: 727, number: '727', status: 'processing', currency: 'EUR', date_created: '2026-10-29T14:00:00',
            discount_total: '5.00', shipping_total: '10.00', total_tax: '1.35', total: '45.35',
            line_items: [{ name: 'Woo Single #1', quantity: 2, price: 9, total: '18.00', image: { src: 'https://woo.example.com/1.jpg' } }],
            shipping: { first_name: 'Jean', last_name: 'Dupont', address_1: '5 rue Nationale', city: 'Lille', postcode: '59000', country: 'FR' },
            billing: { email: 'jean@example.com' },
            payment_method_title: 'Direct Bank Transfer',
        })!;
        expect(data.status).toEqual({ status: 'processing' });
        expect(data.items[0]).toMatchObject({ title: 'Woo Single #1', quantity: 2, price: 9, total: 18, image: { src: 'https://woo.example.com/1.jpg' } });
        expect([data.discount, data.shipping, data.tax, data.total]).toEqual([5, 10, 1.35, 45.35]);
        expect(data.shippingAddress).toBe('Jean Dupont\n5 rue Nationale\n59000 Lille\nFR');
        expect(data.payment).toBe('Direct Bank Transfer');
    });

    it('adds up a WooCommerce order with a coupon: each line before the discount, the discount taken once', () => {
        const data = readOrder({
            id: 728, status: 'processing', currency: 'EUR',
            line_items: [{ name: 'Lamp', quantity: 1, price: 100, subtotal: '100.00', total: '90.00' }],
            discount_total: '10.00', shipping_total: '10.00', total: '100.00',
        })!;
        expect(data.items[0]!.total).toBe(100);
        expect([data.subtotal, data.discount, data.shipping, data.total]).toEqual([100, 10, 10, 100]);
        // Without a tool total, the computed one agrees with the rows the receipt shows.
        const computed = readOrder({ line_items: [{ name: 'Lamp', quantity: 1, subtotal: '100.00', total: '90.00' }], discount_total: '10.00', shipping_total: '10.00' })!;
        expect(computed.total).toBe(100);
    });

    it('keeps a quantity of 0 as 0, and counts nothing for that line', () => {
        const data = readOrder({ items: [{ title: 'Removed', quantity: 0, price: 12 }, { title: 'Kept', quantity: 2, price: 5 }] })!;
        expect(data.items[0]).toMatchObject({ title: 'Removed', quantity: 0, total: 0 });
        expect(data.itemCount).toBe(2);
        expect([data.subtotal, data.total]).toEqual([10, 10]);
        // A line the tool totals anyway is still left out of the sum: none of it was bought.
        expect(readOrder({ items: [{ title: 'Removed', quantity: 0, total: 12 }, { title: 'Kept', quantity: 1, total: 5 }] })!.subtotal).toBe(5);
        stop = setupOrderCard({ tool: 'get_order' });
        const card = draw(call('resolved', { reference: '1', items: [{ title: 'Removed', quantity: 0, price: 12 }] }));
        expect(text(card, '.aparte-order__qty')).toBe('× 0');
    });

    it('reads a price written with no digit before its decimal separator', () => {
        expect(readOrder({ total: '.99' })!.total).toBe(0.99);
        expect(readOrder({ total: '$.99' })!).toMatchObject({ total: 0.99, currency: 'USD' });
        expect(readOrder({ total: ',50 €' })!).toMatchObject({ total: 0.5, currency: 'EUR' });
    });

    it("reads a WooCommerce 'completed' as confirmed: fulfilled and paid, which says nothing of a delivery", () => {
        expect(readOrder({ reference: '1', status: 'completed' })!.status).toEqual({ status: 'confirmed' });
    });

    it('reads a booking given as a day and a time as its start, not as the day it was placed', () => {
        const data = readOrder({ kind: 'booking', date: '2026-11-07', time: '19:30', guests: 2 })!;
        expect(data.booking).toEqual({ start: { date: new Date(2026, 10, 7, 19, 30), allDay: false }, guests: 2 });
        expect(data.date).toBeUndefined();
        expect(readOrder({ kind: 'booking', date: '2026-11-07' })!.booking).toEqual({ start: { date: new Date(2026, 10, 7), allDay: true } });
        // A booking with its own start keeps `date` as the day it was made.
        const made = readOrder({ kind: 'booking', date: '2026-10-20', booking: { start: '2026-11-07T19:30' } })!;
        expect(made.booking!.start).toEqual({ date: new Date(2026, 10, 7, 19, 30), allDay: false });
        expect(made.date).toEqual(new Date(2026, 9, 20));
    });

    it('reads a booking day stamped at midnight UTC as that day where the reader is, not the evening before', () => {
        expect(readOrder({ kind: 'booking', booking: { start: '2026-11-07T00:00:00Z', end: '2026-11-09T00:00:00.000+00:00' } })!.booking).toEqual({
            start: { date: new Date(2026, 10, 7), allDay: true }, end: { date: new Date(2026, 10, 9), allDay: true },
        });
        expect(readOrder({ reference: '1', delivery: { estimate: '2026-11-03T00:00:00Z' } })!.delivery!.estimate).toEqual({ from: { date: new Date(2026, 10, 3), allDay: true } });
        // A real time in UTC is still that moment.
        expect(readOrder({ kind: 'booking', booking: { start: '2026-11-07T18:30:00Z' } })!.booking!.start!.allDay).toBe(false);
    });

    it("reads a Stripe Checkout session, dividing its cents only when told to", () => {
        const session = {
            object: 'checkout.session', id: 'cs_test_a1b2c3', status: 'complete', payment_status: 'paid',
            currency: 'eur', amount_subtotal: 12990, amount_total: 13490,
            total_details: { amount_discount: 500, amount_shipping: 1000, amount_tax: 0 },
            customer: 'cus_NffrFeUfNV2Hib',
            customer_details: { name: 'Ada L.', email: 'ada@example.com' },
            line_items: { object: 'list', data: [{ description: 'Desk lamp', quantity: 1, amount_total: 12990, price: { unit_amount: 12990 } }] },
            payment_method: 'pm_1Q0PsIJvEtkwdCNYMSaVuRz6',
        };
        const data = readOrder({ ...session, minorUnits: true })!;
        expect(data.currency).toBe('EUR');
        expect([data.subtotal, data.discount, data.shipping, data.tax, data.total]).toEqual([129.9, 5, 10, 0, 134.9]);
        expect(data.items[0]).toEqual({ title: 'Desk lamp', quantity: 1, price: 129.9, total: 129.9 });
        expect(data.status).toEqual({ status: 'confirmed' });
        expect(data.customer).toBe('Ada L.\nada@example.com');
        expect(data.payment).toBeUndefined();
        expect(data.reference).toBe('cs_test_a1b2c3');
        expect(readOrder(session)!.total).toBe(13490);
        // The yen has no minor unit.
        expect(readOrder({ amount_total: 4900, currency: 'jpy', minorUnits: true })!.total).toBe(4900);
        expect(readOrder({ amount_total: 4900, minorUnits: true })!.total).toBe(49);
    });

    it('reads lines from a GraphQL connection, and their options as a subtitle', () => {
        const data = readOrder({ lineItems: { edges: [{ node: { name: 'Tee', options: [{ name: 'Size', value: 'M' }, 'Blue'], images: [{ url: 'https://cdn.example.com/t.jpg', altText: 'A tee' }] } }] } })!;
        expect(data.items[0]).toEqual({ title: 'Tee', subtitle: 'M · Blue', image: { src: 'https://cdn.example.com/t.jpg', alt: 'A tee' }, quantity: 1 });
        expect(readOrder({ products: { nodes: ['Pen', '', 3] } })!.items).toEqual([{ title: 'Pen', quantity: 1 }]);
    });

    it('reads payment as a card, and the tool’s facts as a list or a map', () => {
        expect(readOrder({ reference: '1', payment: { brand: 'visa', last4: '4242' } })!.payment).toBe('Visa •••• 4242');
        expect(readOrder({ reference: '1', payment_method_details: { card: { brand: 'amex', last4: '0005' } } })!.payment).toBe('Amex •••• 0005');
        expect(readOrder({ reference: '1', payment: { label: 'PayPal' } })!.payment).toBe('PayPal');
        expect(readOrder({ reference: '1', payment_gateway_names: ['shopify_payments', 'gift_card'] })!.payment).toBe('shopify_payments, gift_card');
        expect(readOrder({ reference: '1', facts: [{ name: 'Gift', value: true }, { label: 'Seats', value: 2 }, { label: '' }] })!.facts).toEqual([{ label: 'Seats', value: '2' }]);
        expect(readOrder({ reference: '1', note_attributes: [{ name: 'Gift note', value: 'Happy birthday' }] })!.facts).toEqual([{ label: 'Gift note', value: 'Happy birthday' }]);
    });

    it('reads a delivery estimate as a date, a range or words', () => {
        const est = (value: unknown) => readOrder({ reference: '1', delivery: { estimate: value } })!.delivery?.estimate;
        expect(est('2–4 business days')).toEqual({ text: '2–4 business days' });
        expect(est({ from: '2026-11-03', to: '2026-11-05' })).toEqual({ from: { date: new Date(2026, 10, 3), allDay: true }, to: { date: new Date(2026, 10, 5), allDay: true } });
        expect(est(['2026-11-05', '2026-11-03'])).toEqual({ from: { date: new Date(2026, 10, 5), allDay: true } });
        expect(est({ latest: '2026-11-05' })).toEqual({ from: { date: new Date(2026, 10, 5), allDay: true } });
        expect(est({ nothing: 1 })).toBeUndefined();
        expect(readOrder({ reference: '1', estimated_delivery: '2026-11-04' })!.delivery?.estimate).toEqual({ from: { date: new Date(2026, 10, 4), allDay: true } });
        expect(readOrder({ reference: '1', delivery: 'Tomorrow' })!.delivery).toEqual({ estimate: { text: 'Tomorrow' } });
        expect(readOrder({ reference: '1' })!.delivery).toBeUndefined();
    });

    it('draws a range estimate as one span', () => {
        stop = setupOrderCard({ tool: 'get_order' });
        const card = draw(call('resolved', { reference: '1', delivery: { estimate: { from: '2026-11-03', to: '2026-11-05' } } }));
        expect(plain(text(card, '.aparte-order__estimate'))).toMatch(/^Tue, Nov 3\s?[–-]\s?Thu, Nov 5$/);
    });

    it('tells a booking from an order, and reads its block from the top level too', () => {
        expect(readOrder({ type: 'reservation', start: '2026-11-06T20:00' })!.kind).toBe('booking');
        expect(readOrder({ reservation: { start: '2026-11-06T20:00' } })!.kind).toBe('booking');
        expect(readOrder({ check_in: '2026-11-06', check_out: '2026-11-08', party_size: 3 })!.booking).toEqual({
            start: { date: new Date(2026, 10, 6), allDay: true }, end: { date: new Date(2026, 10, 8), allDay: true }, guests: 3,
        });
        expect(readOrder({ object: 'checkout.session', start: '2026-11-06', reference: '1' })!.kind).toBe('order');
        // An order's `address` is its delivery address, never a booking's place.
        const order = readOrder({ reference: '1', address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '73301', country: 'US' } })!;
        expect(order.booking).toBeUndefined();
        expect(order.shippingAddress).toBe('1 Main St\nAustin, TX 73301\nUS');
        // An end before the start is dropped; people as a list are counted.
        expect(readOrder({ kind: 'booking', booking: { start: '2026-11-06T20:00', end: '2026-11-06T18:00', attendees: ['a', 'b'] } })!.booking).toEqual({
            start: { date: new Date(2026, 10, 6, 20), allDay: false }, guests: 2,
        });
        expect(readOrder({ kind: 'booking', booking: { venue: 'Hall' } })!.booking).toEqual({ location: 'Hall' });
    });

    it('reads Stripe-shaped addresses and strips a leading # from the number', () => {
        const data = readOrder({ order_number: '#1042', shipping_details: { name: 'Ada', address: { line1: '1 rue A', line2: 'Bât. B', postal_code: '75001', city: 'Paris', country: 'FR' } } })!;
        expect(data.reference).toBe('1042');
        expect(data.shippingAddress).toBe('Ada\n1 rue A\nBât. B\n75001 Paris\nFR');
        expect(readOrder({ reference: '1', shippingAddress: '  a \n  b ' })!.shippingAddress).toBe('a\nb');
    });

    it('returns null for what has nothing to draw', () => {
        expect(readOrder(null)).toBeNull();
        expect(readOrder([ORDER])).toBeNull();
        expect(readOrder({})).toBeNull();
        expect(readOrder({ status: 'shipped', items: [{ qty: 2 }] })).toBeNull();
    });

    it('reads a moment strictly: ISO strings, epochs and Dates, a bare day as a day', () => {
        expect(readWhen('2026-11-07')).toEqual({ date: new Date(2026, 10, 7), allDay: true });
        expect(readWhen('2026-11-07 19:30')).toEqual({ date: new Date(2026, 10, 7, 19, 30), allDay: false });
        expect(readWhen('Nov 7')).toBeUndefined();
        expect(readWhen('2026-13-45')).toBeUndefined();
        expect(readWhen(new Date(2026, 10, 7))).toEqual({ date: new Date(2026, 10, 7), allDay: true });
        expect(readWhen(new Date(2026, 10, 7, 9).getTime() / 1000)!.allDay).toBe(false);
        expect(readWhen(Number.NaN)).toBeUndefined();
        expect(readWhen(null)).toBeUndefined();
    });

    it('counts nights by the calendar, not by hours', () => {
        expect(nightsOf(new Date(2026, 10, 6, 15), new Date(2026, 10, 7, 11))).toBe(1);
        expect(nightsOf(new Date(2026, 10, 6), new Date(2026, 10, 6, 23))).toBe(0);
        expect(nightsOf(new Date(2026, 10, 8), new Date(2026, 10, 6))).toBe(0);
    });
});
