/**
 * Alex's orders, as the shop's order API would return them, and the return it opens. They are
 * written in the order card's own fields (`@aparte/plugin-cards/order`), so its setup needs no
 * `map`; a Shopify or WooCommerce order would be read as it comes too.
 *
 * The dates are counted from today, so the parcel is always "arriving tomorrow" and the return
 * window always open, whenever the template is opened.
 */
import type { OrderInput } from '@aparte/plugin-cards/order';
import { CUSTOMER } from './brand';
import { findItem, photoUrl } from './catalog';

/** A day counted from today, as the `YYYY-MM-DD` an API writes and the card reads as a day. */
function dayFromNow(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Sat, Nov 14": a day in a sentence the shop writes itself. */
function dayName(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

/** An order line from a catalogue item, at the price it was bought for. */
function line(id: string, quantity: number, price: number, subtitle?: string): NonNullable<OrderInput['items']>[number] {
    const item = findItem(id)!;
    return { title: item.name, ...(subtitle ? { subtitle } : {}), image: photoUrl(item), quantity, price };
}

/** The parcel on its way: what "where is my order?" opens. */
export function currentOrder(): OrderInput {
    return {
        reference: 'PC-48213',
        status: 'shipped',
        date: dayFromNow(-2),
        currency: 'EUR',
        items: [line('fold-mugs', 1, 24), line('linen-apron', 1, 32, 'Sage'), line('cone-dripper', 2, 22)],
        discount: 10,
        shipping: 0,
        payment: CUSTOMER.card,
        shippingAddress: CUSTOMER.address,
        delivery: {
            estimate: dayFromNow(1),
            carrier: 'Parcelway',
            trackingNumber: 'PW 4471 2290 18',
            trackingUrl: 'https://example.com/track/PW4471229018',
        },
        url: 'https://example.com/account/orders/PC-48213',
    };
}

/** The order the return is about, delivered last week. */
export const PAST_ORDER = { reference: 'PC-47790', item: 'ash-board', price: 46 } as const;

/** The last day to send the board back: thirty days from its delivery, nine days ago. */
export function dropOffDay(): string {
    return dayName(21);
}

export type ReturnReason = 'Doesn’t suit my kitchen' | 'Arrived damaged' | 'Ordered by mistake';

/** The return as the shop's API confirms it: a reference, where it stands, and the two facts to keep. */
export function openReturn(reason: string): OrderInput {
    const item = findItem(PAST_ORDER.item)!;
    // Something that arrived damaged is not sent back: the refund goes out at once.
    const damaged = reason === 'Arrived damaged';
    return {
        title: item.name,
        reference: 'RT-58120',
        status: 'processing',
        // The confirmation's headline: the status alone would say "Order being prepared".
        headline: 'Return started',
        currency: 'EUR',
        facts: [
            { label: `Refund to ${CUSTOMER.card}`, value: `€${PAST_ORDER.price.toFixed(2)}` },
            damaged ? { label: 'Send it back', value: 'No need' } : { label: 'Drop off by', value: dropOffDay() },
        ],
    };
}
