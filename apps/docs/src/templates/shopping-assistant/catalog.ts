/**
 * Pinecrate's catalogue: eight products in the shop's own shape (the fields its API would
 * return), the search the assistant's tool runs over them, and their photos.
 *
 * The photos are the template's own SVG files, imported as URLs (`?no-inline`, so the build
 * emits them as files instead of inlining them). A card only takes an absolute `http(s)`
 * picture — a tool's result is untrusted, and `data:` or a relative path is refused — so
 * `photoUrl` resolves them against the page, the way a real shop's API returns its CDN's
 * addresses. In your app, `photo` is that address and `photoUrl` goes.
 */
import ashBoard from './photos/ash-board.svg?no-inline';
import coneDripper from './photos/cone-dripper.svg?no-inline';
import driftKettle from './photos/drift-kettle.svg?no-inline';
import emberKettle from './photos/ember-kettle.svg?no-inline';
import foldMugs from './photos/fold-mugs.svg?no-inline';
import halyardKettle from './photos/halyard-kettle.svg?no-inline';
import linenApron from './photos/linen-apron.svg?no-inline';
import ternKettle from './photos/tern-kettle.svg?no-inline';

export interface CatalogItem {
    id: string;
    name: string;
    /** Where the photo is served from. */
    photo: string;
    /** In euros. */
    price: number;
    /** The price before this week's sale, when there is one. */
    listPrice?: number;
    stars: number;
    reviews: number;
    stock: 'in_stock' | 'low_stock' | 'out_of_stock' | 'preorder';
    /** The ribbon over the photo. */
    label?: string;
    colours?: string[];
    blurb: string;
    /** A delivery cost in euros (0 is free), or the shop's own words. */
    delivery: number | string;
    /** Words a search for this product uses. */
    tags: string[];
}

export const CATALOG: CatalogItem[] = [
    {
        id: 'ember-kettle',
        name: 'Ember Gooseneck Kettle',
        photo: emberKettle,
        price: 79,
        listPrice: 99,
        stars: 4.7,
        reviews: 1284,
        stock: 'in_stock',
        label: 'Bestseller',
        colours: ['Charcoal', 'Brushed steel', 'Sage'],
        blurb: 'An electric pour-over kettle that holds the water at the degree you set, from 40 to 100 °C, for an hour. 0.9 litre, a counterweighted handle and a spout that pours a pencil-thin stream.',
        delivery: 0,
        tags: ['kettle', 'pour', 'over', 'gooseneck', 'coffee', 'tea', 'electric', 'ember'],
    },
    {
        id: 'drift-kettle',
        name: 'Drift Enamel Stovetop Kettle',
        photo: driftKettle,
        price: 54,
        stars: 4.4,
        reviews: 312,
        stock: 'low_stock',
        colours: ['Cream', 'Moss'],
        blurb: 'Enamelled steel with an oak handle, for gas, electric and induction hobs. 1.6 litres, and a whistle you can take off.',
        delivery: 4.95,
        tags: ['kettle', 'stovetop', 'enamel', 'tea', 'induction', 'drift'],
    },
    {
        id: 'tern-kettle',
        name: 'Tern Pour-Over Kettle',
        photo: ternKettle,
        price: 42,
        stars: 4.2,
        reviews: 96,
        stock: 'in_stock',
        blurb: 'Brushed stainless steel and a long, thin spout, for the hob. The lightest of our pour-over kettles.',
        delivery: 4.95,
        tags: ['kettle', 'pour', 'over', 'gooseneck', 'coffee', 'stovetop', 'tern'],
    },
    {
        id: 'halyard-kettle',
        name: 'Halyard Glass Kettle',
        photo: halyardKettle,
        price: 68,
        stars: 4.5,
        reviews: 208,
        stock: 'preorder',
        label: 'New',
        blurb: 'Borosilicate glass, so you see it boil, on a cordless base. 1.2 litres, ships from 20 November.',
        delivery: 0,
        tags: ['kettle', 'glass', 'electric', 'tea', 'halyard'],
    },
    {
        id: 'fold-mugs',
        name: 'Fold Stoneware Mugs, set of 2',
        photo: foldMugs,
        price: 24,
        stars: 4.8,
        reviews: 642,
        stock: 'in_stock',
        label: 'Gift idea',
        blurb: 'Hand-glazed stoneware in oat and sage, 330 ml each. Dishwasher safe.',
        delivery: 0,
        tags: ['mug', 'mugs', 'stoneware', 'gift', 'coffee', 'tea', 'fold'],
    },
    {
        id: 'ash-board',
        name: 'Ash Serving Board',
        photo: ashBoard,
        price: 38,
        listPrice: 46,
        stars: 4.6,
        reviews: 187,
        stock: 'in_stock',
        blurb: 'Solid European ash, oiled, 45 × 25 cm, with a handle to hang it by.',
        delivery: 0,
        tags: ['board', 'serving', 'cheese', 'wood', 'ash', 'gift', 'table'],
    },
    {
        id: 'linen-apron',
        name: 'Linen Apron',
        photo: linenApron,
        price: 32,
        stars: 4.5,
        reviews: 220,
        stock: 'low_stock',
        colours: ['Sage', 'Oat', 'Charcoal'],
        blurb: 'Washed linen with a split pocket and long ties that wrap to the front.',
        delivery: 'Delivered by Friday',
        tags: ['apron', 'linen', 'gift', 'kitchen', 'cook'],
    },
    {
        id: 'cone-dripper',
        name: 'Cone Pour-Over Dripper',
        photo: coneDripper,
        price: 22,
        stars: 4.6,
        reviews: 410,
        stock: 'in_stock',
        blurb: 'Porcelain, spiral ribs and one large hole: it brews one or two cups through a size 02 paper filter.',
        delivery: 0,
        tags: ['dripper', 'pour', 'over', 'coffee', 'filter', 'gift', 'cone'],
    },
];

export function findItem(id: string): CatalogItem | undefined {
    return CATALOG.find((item) => item.id === id);
}

/** The photo's absolute address: what a card accepts (see the note at the top). */
export function photoUrl(item: CatalogItem): string {
    return new URL(item.photo, location.href).href;
}

/**
 * The products a query names, best match first, under `maxPrice` when it is given. Out of stock
 * goes last: a search answers what can be bought.
 */
export function searchCatalog(query: string, maxPrice?: number): CatalogItem[] {
    const words = query.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const score = (item: CatalogItem): number => item.tags.filter((tag) => words.some((word) => word.startsWith(tag))).length;
    return CATALOG.filter((item) => maxPrice === undefined || item.price <= maxPrice)
        .map((item) => ({ item, score: score(item) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.item.stock === 'out_of_stock') - Number(b.item.stock === 'out_of_stock'))
        .map((hit) => hit.item);
}
