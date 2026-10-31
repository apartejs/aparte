/**
 * The trip the concierge is planning, dated from the moment the page opens: it starts in three
 * days and lasts three nights, and the forecast starts today. A template dated once would show
 * a trip that already happened a week after it shipped.
 */
export const DESTINATION = { city: 'Porto', country: 'Portugal', timeZone: 'Europe/Lisbon' } as const;

/** Midnight today, in the traveller's own calendar. */
function today(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A day counted from today. By the calendar, not by 24-hour steps, which a DST change shifts. */
export function dayFromToday(n: number): Date {
    const day = today();
    day.setDate(day.getDate() + n);
    return day;
}

/**
 * The days between today and the arrival: what the trip panel counts down. A `number`, not the
 * literal 3, since the panel and the welcome word it for any value ("Tomorrow").
 */
export const DAYS_TO_GO: number = 3;

export const TRIP = {
    start: dayFromToday(DAYS_TO_GO),
    end: dayFromToday(DAYS_TO_GO + 3),
    nights: 3,
    guests: 2,
} as const;

/**
 * A day as a hotel writes it, `2026-11-07`, from the traveller's calendar. `toISOString()`
 * would write the UTC day, the day before for anyone east of Greenwich at midnight.
 */
export function isoDay(date: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const SHORT_DAY = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'long' });

/** "Tue, Nov 3 – Fri, Nov 6", in the chat's language, as the cards write their dates. */
export function tripDates(): string {
    return SHORT_DAY.formatRange(TRIP.start, TRIP.end);
}

/** "Thursday": how the replies name a day of the trip. */
export function weekday(date: Date): string {
    return WEEKDAY.format(date);
}

/**
 * How far a time zone is from UTC right now, in minutes. The place card reads "Open now" on
 * the place's clock when it is given one: a traveller planning dinner in Porto from New York
 * wants Porto's evening, not theirs.
 */
export function utcOffsetOf(timeZone: string, at = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    // The wall clock was read to the minute: compare it with `at` cut to the minute too.
    return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}
