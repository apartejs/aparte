/**
 * What the concierge says. Everything else in the template is the real library; only the model
 * is a script, so the chat answers without a key and the same way every time.
 *
 * A turn that calls a tool ends there: the loop runs the tool (the booking asks the traveller
 * first), then asks the model again with the result, and the scenario that declared `after` for
 * that tool says what comes next. `match` handles the one reply the default rule cannot pick:
 * the booking refused.
 */
import { contentToText } from '@aparte/core';
import type { AparteChatRequest, AparteMessage, AparteSegment } from '@aparte/core';
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';
import { BRAND, CONCIERGE, TRAVELLER } from './brand';
import { confirmStay, describePlaces, forecast, placesByTheRiver, RAIN_DAY, STAY_OFFER } from './porto';
import { PLACES_QUESTION, STAY_QUESTION, WEATHER_QUESTION } from './starters';
import { BOOK_TOOL, FORECAST_TOOL, PICTURES_TOOL, PLACES_TOOL } from './tools';
import { DAYS_TO_GO, DESTINATION, TRIP, weekday } from './trip';

const city = { city: DESTINATION.city };

const AFTER_FORECAST = `Mild for the time of year, with one wet day: **${weekday(RAIN_DAY)}** looks like steady rain, so keep it for the Port lodges and the tiled churches. Evenings drop to about 11 °C by the river, so bring a warm layer.`;
const AFTER_PLACES = 'Four within a short walk of the river. **Taberna do Cais** is the one for grilled fish (closed on Mondays), and **Adega Velha** pours Port until 1 am, for after. Press **Save to my trip** to keep them.';
const AFTER_BOOKING = `You’re booked. Check-in is from 3 pm on **${weekday(TRIP.start)}**, and the reference is in your trip.`;

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default: `I can check the weather for your trip, find places to eat, book your stay or show you around ${DESTINATION.city}. What would help?`,

    pack: {
        when: /pack|bring|wear/i,
        turn: '- **A light rain jacket**, for the wet day.\n- **A warm layer** for the evenings by the river.\n- **Shoes with grip**: Porto is steep, and the cobbles are slippery in the rain.\n- **A small day bag** for the Port tastings and the market.',
    },
    weather: { when: /weather|forecast|\brain|temperature|sunny/i, turn: [{ tool: FORECAST_TOOL, input: city }] },
    pictures: { when: /show me|photo|picture|look like/i, turn: [{ tool: PICTURES_TOOL, input: city }] },
    stay: {
        when: /book|stay|hotel|room|sleep/i,
        turn: [
            { text: `**${STAY_OFFER.hotel}** has a river-view double free for your ${TRIP.nights} nights, €${STAY_OFFER.total} in total. I’ll book it once you say yes.` },
            { tool: BOOK_TOOL, input: STAY_OFFER },
        ],
    },
    places: { when: /eat|dinner|lunch|restaurant|food|drink|café|cafe|bar|visit/i, turn: [{ tool: PLACES_TOOL, input: { ...city, near: 'Ribeira', kind: 'restaurant' } }] },

    forecasted: { after: FORECAST_TOOL, turn: AFTER_FORECAST },
    found: { after: PLACES_TOOL, turn: AFTER_PLACES },
    pictured: { after: PICTURES_TOOL, turn: 'The river front is best at the end of the day, from the Gaia side, when the houses catch the last sun. Tram 1 runs along the water to the sea.' },
    booked: { after: BOOK_TOOL, turn: AFTER_BOOKING },
    kept: `No problem, nothing is booked. Tell me what matters most (the price, a view, being near the metro) and I’ll look again.`,
};

/**
 * The reply a result's tool cannot pick alone: a booking the traveller refused also comes back
 * as a `book_stay` result, and must not be answered "You’re booked".
 */
export function match(request: AparteChatRequest): string | undefined {
    const last = request.messages[request.messages.length - 1];
    if (last?.role === 'tool' && /rejected (by the user|this tool call)/.test(contentToText(last.content))) return 'kept';
    return undefined;
}

/** The welcome every conversation opens on, stamped with now. */
export function welcome(): AparteMessage {
    const when = DAYS_TO_GO === 1 ? 'tomorrow' : `in ${DAYS_TO_GO} days`;
    return {
        id: 'welcome',
        role: 'assistant',
        timestamp: Date.now(),
        content: `Hi ${TRAVELLER.firstName}, I’m **${CONCIERGE}**, your ${BRAND} concierge. ${DESTINATION.city} is **${when}**: ask me about the weather, where to eat, or to book your stay.`,
    };
}

// ── The tile's conversation ──────────────────────────────────────────────────────────────────

let seedIds = 0;

/** A finished tool call, as the transcript stores it: the call, the model's sentence, the data. */
function call(name: string, input: Record<string, unknown>, result: string, structuredResult: unknown): AparteSegment {
    const n = ++seedIds;
    return { id: `s${n}`, type: 'tool_call', status: 'resolved', toolCall: { id: `t${n}`, name, input }, result, structuredResult };
}

const text = (content: string): AparteSegment => ({ id: `s${++seedIds}`, type: 'text', content });

/**
 * The conversation a tile shows, finished: the forecast, the stay booked, then the places, so
 * the tile ends on the pictures of the places. The minutes are spaced back from now.
 */
export function seed(): AparteMessage[] {
    const at = (minutesAgo: number): number => Date.now() - minutesAgo * 60_000;
    const week = forecast();
    const places = placesByTheRiver();
    const booking = confirmStay(STAY_OFFER);
    return [
        { id: 'u1', role: 'user', content: WEATHER_QUESTION, timestamp: at(9) },
        { id: 'a1', role: 'assistant', timestamp: at(9), segments: [call(FORECAST_TOOL, city, `${week.city}, next 7 days.`, week), text(AFTER_FORECAST)] },
        { id: 'u2', role: 'user', content: STAY_QUESTION, timestamp: at(6) },
        { id: 'a2', role: 'assistant', timestamp: at(6), segments: [call(BOOK_TOOL, STAY_OFFER, `Booked: ${booking.hotel}.`, booking), text(AFTER_BOOKING)] },
        { id: 'u3', role: 'user', content: PLACES_QUESTION, timestamp: at(2) },
        { id: 'a3', role: 'assistant', timestamp: at(2), segments: [call(PLACES_TOOL, { ...city, near: 'Ribeira' }, describePlaces(places), places), text(AFTER_PLACES)] },
    ];
}
