/**
 * What Saltroad's travel API answers about Porto: the forecast, places near the river, a room,
 * and pictures of the city. In a real app each of these is a request to your backend (or to a
 * weather, places or booking provider); here they are fixed, dated from today (trip.ts), so the
 * tools in tools.ts return them as an API would.
 *
 * The forecast and the booking keep the API's own field names on purpose: tools.ts shows the
 * `map` that turns them into a card's fields. The places are already in the place card's
 * fields, which is what a tool written for the card would return.
 */
import type { MediumInput } from '@aparte/plugin-cards/media';
import type { PlaceInput } from '@aparte/plugin-cards/place';
import cafe from './pictures/cafe.svg?url&no-inline';
import cellar from './pictures/cellar.svg?url&no-inline';
import riverside from './pictures/riverside.svg?url&no-inline';
import sunset from './pictures/sunset.svg?url&no-inline';
import table from './pictures/table.svg?url&no-inline';
import tiles from './pictures/tiles.svg?url&no-inline';
import tram from './pictures/tram.svg?url&no-inline';
import { dayFromToday, DESTINATION, isoDay, TRIP, utcOffsetOf } from './trip';

/**
 * A card takes only an absolute http(s) address for a picture: a tool's result is untrusted, and a
 * relative path would resolve against whatever page shows the card. These pictures are the site's
 * own illustrations (no image host, so the page works offline), made absolute against it.
 */
const picture = (path: string): string => new URL(path, location.href).href;

// ── The forecast ─────────────────────────────────────────────────────────────────────────────

export interface ForecastResult {
    city: string;
    now: { sky: string; temp_c: number; feels_c: number; humidity: number; wind_kmh: number; wind_from: number; rain_chance: number };
    days: Array<{ date: string; sky: string; max_c: number; min_c: number; rain_chance: number }>;
}

/** The week from today: [sky, high, low, chance of rain]. The trip is days 3 to 6, with one wet day. */
const WEEK: Array<[string, number, number, number]> = [
    ['partly-cloudy', 18, 12, 10],
    ['clear', 19, 11, 0],
    ['cloudy', 17, 12, 20],
    ['clear', 19, 12, 0],
    ['rain', 16, 12, 80],
    ['partly-cloudy', 18, 11, 15],
    ['drizzle', 17, 12, 40],
];

/** The trip's wet day, which the concierge's reply names. */
export const RAIN_DAY = dayFromToday(WEEK.findIndex(([sky]) => sky === 'rain'));

export function forecast(): ForecastResult {
    return {
        city: DESTINATION.city,
        now: { sky: 'partly-cloudy', temp_c: 17, feels_c: 16, humidity: 72, wind_kmh: 14, wind_from: 300, rain_chance: 10 },
        days: WEEK.map(([sky, max, min, rain], i) => ({ date: isoDay(dayFromToday(i)), sky, max_c: max, min_c: min, rain_chance: rain })),
    };
}

// ── Places by the river ──────────────────────────────────────────────────────────────────────

/** Every day of the week, the same hours. */
const daily = (open: string, close: string): PlaceInput['hours'] => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close }));

/** Lunch and dinner, closed on one day of the week (0 = Sunday). */
const twoServices = (closedOn: number): PlaceInput['hours'] =>
    [0, 1, 2, 3, 4, 5, 6]
        .filter((day) => day !== closedOn)
        .flatMap((day) => [
            { day, open: '12:00', close: '15:00' },
            { day, open: '19:00', close: '23:00' },
        ]);

export interface PlacesResult {
    title: string;
    places: PlaceInput[];
}

export function placesByTheRiver(): PlacesResult {
    // Porto's offset now: "Open now" is read on Porto's clock, wherever the traveller is.
    const utcOffset = utcOffsetOf(DESTINATION.timeZone);
    return {
        title: 'By the river, in Ribeira',
        places: [
            {
                name: 'Taberna do Cais',
                category: 'Seafood restaurant',
                types: ['restaurant'],
                image: picture(table),
                rating: 4.7,
                reviewCount: 1284,
                priceLevel: 2,
                address: 'Cais da Ribeira 34',
                distance: 220,
                phone: '+351 220 000 134',
                website: 'https://example.com/taberna-do-cais',
                coordinates: { lat: 41.1405, lng: -8.6129 },
                hours: twoServices(1),
                utcOffset,
                tags: ['Grilled fish', 'Terrace'],
            },
            {
                name: 'Adega Velha',
                category: 'Wine bar',
                types: ['bar'],
                image: picture(cellar),
                rating: 4.6,
                reviewCount: 642,
                priceLevel: 2,
                address: 'Rua da Fonte Taurina 9',
                distance: 140,
                website: 'https://example.com/adega-velha',
                coordinates: { lat: 41.1408, lng: -8.6122 },
                // Past midnight: the card reads 17:00 to 01:00 as one evening.
                hours: daily('17:00', '01:00'),
                utcOffset,
                tags: ['Port tastings', 'Late'],
            },
            {
                name: 'Casa Azulejo',
                category: 'Café & bakery',
                types: ['cafe'],
                image: picture(cafe),
                rating: 4.5,
                reviewCount: 913,
                priceLevel: 1,
                address: 'Rua de São João 51',
                distance: 400,
                coordinates: { lat: 41.1416, lng: -8.6135 },
                hours: daily('08:00', '19:00'),
                utcOffset,
                tags: ['Pastéis de nata', 'Breakfast'],
            },
            {
                name: 'Brasa do Douro',
                category: 'Grill restaurant',
                types: ['restaurant'],
                image: picture(sunset),
                rating: 4.4,
                reviewCount: 530,
                priceLevel: 3,
                address: 'Muro dos Bacalhoeiros 88',
                distance: 310,
                phone: '+351 220 000 188',
                website: 'https://example.com/brasa-do-douro',
                coordinates: { lat: 41.1402, lng: -8.6141 },
                hours: [0, 1, 3, 4, 5, 6].map((day) => ({ day, open: '19:00', close: '23:30' })),
                utcOffset,
                tags: ['River view', 'Book ahead'],
            },
        ],
    };
}

/** What the model reads of a list of places: names and the one fact that tells them apart. */
export function describePlaces(result: PlacesResult): string {
    return result.places.map((p) => `${p.name} (${p.category}, ${p.rating}★, ${p.distance} m)`).join('; ');
}

// ── The stay ─────────────────────────────────────────────────────────────────────────────────

/** The room the concierge offers, as the model passes it to `book_stay`. */
export const STAY_OFFER = {
    hotel: 'Casa da Ribeira',
    room: 'River-view double',
    check_in: isoDay(TRIP.start),
    check_out: isoDay(TRIP.end),
    guests: TRIP.guests,
    total: 486,
    currency: 'EUR',
};

export type StayRequest = typeof STAY_OFFER;

export interface BookingResult {
    confirmation_code: string;
    status: 'confirmed';
    hotel: string;
    room: string;
    address: string;
    check_in: string;
    check_out: string;
    check_in_from: string;
    guests: number;
    total: number;
    currency: string;
    manage_url: string;
}

/** What the booking API answers once the room is taken. */
export function confirmStay(request: StayRequest): BookingResult {
    return {
        confirmation_code: 'SLT-4827',
        status: 'confirmed',
        hotel: request.hotel,
        room: request.room,
        address: 'Rua da Fonte Taurina 21, Porto',
        check_in: request.check_in,
        check_out: request.check_out,
        check_in_from: '3 pm',
        guests: request.guests,
        total: request.total,
        currency: request.currency,
        manage_url: 'https://example.com/trips/SLT-4827',
    };
}

// ── Pictures of the city ─────────────────────────────────────────────────────────────────────

export function cityPictures(): MediumInput[] {
    return [
        { kind: 'image', src: picture(riverside), title: 'Ribeira from the river', alt: 'Tall coloured houses stacked above the Douro, an iron arch bridge beyond them', width: 640, height: 400 },
        { kind: 'image', src: picture(tram), title: 'Tram 1, along the Douro', alt: 'A yellow and red vintage tram climbing a street of coloured houses', width: 640, height: 400 },
        { kind: 'image', src: picture(tiles), title: 'Azulejo façades', alt: 'A wall of blue and white painted tiles around an arched window', width: 640, height: 400 },
        { kind: 'image', src: picture(sunset), title: 'Sunset from the Gaia side', alt: 'The sun going down behind the old town, boats on the river', width: 640, height: 400 },
    ];
}
