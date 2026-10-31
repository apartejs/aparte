/**
 * The concierge's four tools and the card each one is drawn as (@aparte/plugin-cards): the
 * forecast as a `weather` card, places as `place` cards, the booking as an `order` card once it
 * is approved, and pictures of the city as a `media` gallery.
 *
 * A tool returns two things: `content`, the sentence the model reads, and `structuredContent`,
 * the data the card draws. Each card's `map` turns the API's own fields into the card's, so the
 * API keeps its shape. In a real app the handlers call your backend; porto.ts stands in for it.
 */
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteToolCallSegment } from '@aparte/core';
import { setupMediaCard } from '@aparte/plugin-cards/media';
import { setupOrderCard } from '@aparte/plugin-cards/order';
import type { OrderInput } from '@aparte/plugin-cards/order';
import { setupPlaceCard } from '@aparte/plugin-cards/place';
import { setupWeatherCard } from '@aparte/plugin-cards/weather';
import type { WeatherInput } from '@aparte/plugin-cards/weather';
import { cityPictures, confirmStay, describePlaces, forecast, placesByTheRiver } from './porto';
import type { BookingResult, ForecastResult, StayRequest } from './porto';
import { DESTINATION } from './trip';

export const FORECAST_TOOL = 'get_forecast';
export const PLACES_TOOL = 'find_places';
export const BOOK_TOOL = 'book_stay';
export const PICTURES_TOOL = 'show_destination';

/**
 * The buttons under a card that the app answers (app.ts listens for `aparte-card-action`). A
 * button read from a tool's result could only be a link or an id; these are the app's own, so
 * they are declared here, in the card's setup.
 */
export const SAVE_PLACES = 'save-places';
export const ADD_TO_CALENDAR = 'add-to-calendar';

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Tue, Nov 3" from a hotel's `2026-11-03`, read as that day where the reader is. */
function dayOf(iso: unknown): string {
    const [y, m, d] = String(iso).split('-').map(Number);
    return y && m && d ? day.format(new Date(y, m - 1, d)) : String(iso ?? '');
}

/** The booking's API answer as the order card's fields. */
export function bookingAsOrder(result: BookingResult): OrderInput {
    return {
        kind: 'booking',
        title: result.hotel,
        reference: result.confirmation_code,
        status: result.status,
        total: result.total,
        currency: result.currency,
        booking: { start: result.check_in, end: result.check_out, location: result.address, guests: result.guests },
        // The confirmation shows the first two facts: the two a guest checks before they leave.
        facts: [
            { label: 'Room', value: result.room },
            { label: 'Check-in', value: `From ${result.check_in_from}` },
        ],
        url: result.manage_url,
    };
}

/** The forecast's API answer as the weather card's fields. */
export function forecastAsWeather(result: ForecastResult): WeatherInput {
    const { now, days } = result;
    return {
        location: result.city,
        condition: now.sky,
        temperature: now.temp_c,
        feelsLike: now.feels_c,
        high: days[0]?.max_c,
        low: days[0]?.min_c,
        humidity: now.humidity,
        wind: { speed: now.wind_kmh, direction: now.wind_from },
        precipitation: now.rain_chance,
        daily: days.map((d) => ({ date: d.date, condition: d.sky, high: d.max_c, low: d.min_c, precipitation: d.rain_chance })),
    };
}

/** Plug each card in. Before anything renders: a bubble drawn first would show the tool's row. */
export function setupCards(): void {
    setupWeatherCard({
        tool: FORECAST_TOOL,
        map: forecastAsWeather,
        // The days of the trip, not the next hours: that is what a traveller plans with.
        variant: 'forecast',
        // `send` asks the next question for the traveller, through the chat's own composer.
        actions: () => [{ label: 'What should I pack?', send: 'What should I pack for Porto?' }],
    });
    setupPlaceCard({
        tool: PLACES_TOOL,
        currencySymbol: '€',
        variant: 'card',
        // An app's own buttons take the place of the card's Directions / Call / Website: the
        // trip panel is what this app does with a place.
        actions: () => [{ label: 'Save to my trip', id: SAVE_PLACES, primary: true }],
    });
    setupOrderCard({
        tool: BOOK_TOOL,
        map: bookingAsOrder,
        // While the call waits for the traveller's yes, its line names the hotel, not "Order".
        mapInput: (input) => ({ kind: 'booking', ...(typeof input['hotel'] === 'string' ? { title: input['hotel'] } : {}) }),
        variant: 'confirmation',
        actions: () => [{ label: 'Add to calendar', id: ADD_TO_CALENDAR }],
    });
    setupMediaCard({ tool: PICTURES_TOOL, variant: 'gallery' });
}

/** The approval panel's question and its details, read from the call the model made. */
function stayOf(segment: AparteToolCallSegment): Partial<StayRequest> {
    return segment.toolCall.input as Partial<StayRequest>;
}

function nightsBetween(from: unknown, to: unknown): number {
    const [a, b] = [from, to].map((iso) => Date.parse(`${String(iso)}T12:00:00Z`));
    return a && b ? Math.round((b - a) / 86_400_000) : 0;
}

/**
 * Register the tools. `onBooked` runs once a booking has gone through, for the trip panel; the
 * booking asks first (`needsApproval`), since it spends the traveller's money.
 */
export function registerTools(onBooked: (booking: BookingResult) => void): void {
    const config = aparteGlobalConfig;

    config.registerTool(
        {
            name: FORECAST_TOOL,
            description: 'The weather now and for the next seven days in a city.',
            inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        async (call) => {
            const result = forecast();
            const lines = result.days.map((d) => `${d.date}: ${d.sky}, ${d.min_c}–${d.max_c} °C, ${d.rain_chance}% rain`);
            return { toolCallId: call.id, content: `${result.city}, next 7 days. ${lines.join('; ')}`, structuredContent: result };
        },
    );

    config.registerTool(
        {
            name: PLACES_TOOL,
            description: 'Places to eat, drink or visit near a neighbourhood, with ratings and opening hours.',
            inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' }, near: { type: 'string' }, kind: { type: 'string' } },
                required: ['city'],
            },
        },
        async (call) => {
            const result = placesByTheRiver();
            return { toolCallId: call.id, content: describePlaces(result), structuredContent: result };
        },
    );

    config.registerTool(
        {
            name: BOOK_TOOL,
            description: 'Book a room. Charges the traveller’s card, so the traveller approves it first.',
            inputSchema: {
                type: 'object',
                properties: {
                    hotel: { type: 'string' },
                    room: { type: 'string' },
                    check_in: { type: 'string', format: 'date' },
                    check_out: { type: 'string', format: 'date' },
                    guests: { type: 'number' },
                    total: { type: 'number' },
                    currency: { type: 'string' },
                },
                required: ['hotel', 'check_in', 'check_out', 'guests'],
            },
            needsApproval: true,
        },
        async (call) => {
            const booking = confirmStay(call.input as StayRequest);
            onBooked(booking);
            return { toolCallId: call.id, content: `Booked: ${booking.hotel}, ${booking.check_in} to ${booking.check_out}, reference ${booking.confirmation_code}.`, structuredContent: booking };
        },
    );

    config.registerTool(
        {
            name: PICTURES_TOOL,
            description: 'Pictures of a destination.',
            inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        async (call) => {
            const pictures = cityPictures();
            return { toolCallId: call.id, content: `${pictures.length} pictures of ${DESTINATION.city}: ${pictures.map((p) => p.title).join(', ')}.`, structuredContent: pictures };
        },
    );

    // The approval asks "Book Casa da Ribeira, 3 nights?" (the locale's frame is set in app.ts), and
    // its details are the stay as a person checks it, never the call's JSON.
    config.registerToolDisplay(BOOK_TOOL, {
        label: 'Book',
        summary: (segment) => {
            const stay = stayOf(segment);
            const nights = nightsBetween(stay.check_in, stay.check_out);
            return [stay.hotel, nights ? `${nights} nights` : ''].filter(Boolean).join(', ');
        },
        formatInput: (input) => {
            const stay = input as Partial<StayRequest>;
            const nights = nightsBetween(stay.check_in, stay.check_out);
            return [
                [stay.hotel, stay.room].filter(Boolean).join(' · '),
                `${dayOf(stay.check_in)} → ${dayOf(stay.check_out)} · ${nights} nights · ${stay.guests ?? 1} guests`,
                typeof stay.total === 'number' ? `${money.format(stay.total)} in total, free cancellation until 48 hours before` : '',
            ]
                .filter(Boolean)
                .join('\n');
        },
    });
}
