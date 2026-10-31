/**
 * The trip panel beside the chat: the destination and its dates, the stay, the places saved
 * from the chat, and the short notice that says something was done. The chat changes it from two
 * sides: the booking tool's handler fills the stay (tools.ts), and the buttons under the cards,
 * which the app answers through `aparte-card-action` (app.ts), save places and mark the stay as
 * in the calendar.
 *
 * It is the app's own panel, plain DOM over the kit's recipes. Everything written into it is
 * text (`textContent`), since names and addresses come from a tool's result.
 */
import type { Place } from '@aparte/plugin-cards/place';
import type { BookingResult } from './porto';
import { DAYS_TO_GO, TRIP, tripDates } from './trip';

const root = (): HTMLElement => document.querySelector<HTMLElement>('.travel-concierge')!;
const part = <T extends HTMLElement = HTMLElement>(name: string): T => root().querySelector<T>(`[data-tc="${name}"]`)!;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

/** The dates are worked out in the browser, from today: the markup holds a skeleton until then. */
export function showTripDates(): void {
    part('countdown').textContent = DAYS_TO_GO === 1 ? 'Tomorrow' : `In ${DAYS_TO_GO} days`;
    part('dates').textContent = `${tripDates()} · ${TRIP.nights} nights · ${TRIP.guests} travellers`;
}

// ── Saved places ─────────────────────────────────────────────────────────────────────────────

const saved = new Map<string, Place>();

/** Add places to the trip; one already saved is not added twice. Returns how many were new. */
export function savePlaces(places: Place[]): number {
    const list = part('saved');
    let added = 0;
    for (const place of places) {
        if (saved.has(place.name)) continue;
        saved.set(place.name, place);
        added++;
        const item = node('li', 'tc-saved__item');
        item.append(node('span', 'tc-saved__name', place.name));
        const distance = place.distanceText ?? (place.distance !== undefined ? `${place.distance} m` : '');
        const facts = [place.category, place.rating !== undefined ? `${place.rating.toFixed(1)} ★` : '', distance]
            .filter(Boolean)
            .join(' · ');
        if (facts) item.append(node('span', 'tc-saved__facts', facts));
        list.append(item);
    }
    part('saved-empty').hidden = saved.size > 0;
    for (const count of root().querySelectorAll<HTMLElement>('[data-tc="saved-count"]')) {
        count.textContent = String(saved.size);
        count.hidden = saved.size === 0;
    }
    return added;
}

// ── The stay ─────────────────────────────────────────────────────────────────────────────────

/** The booking in the panel, in place of "Nothing booked yet". */
export function showStay(booking: BookingResult): void {
    const card = node('div', 'tc-stay aparte-card');
    const body = node('div', 'aparte-card__body tc-stay__body');
    const head = node('div', 'tc-stay__head');
    head.append(node('span', 'tc-stay__name', booking.hotel), node('span', 'aparte-badge aparte-badge--success aparte-badge--sm', 'Confirmed'));
    body.append(
        head,
        node('span', 'tc-stay__line', `${booking.room} · ${TRIP.nights} nights`),
        node('span', 'tc-stay__line', `Ref. ${booking.confirmation_code} · check-in from ${booking.check_in_from}`),
    );
    const calendar = node('span', 'tc-stay__calendar', 'In your calendar');
    calendar.dataset['tc'] = 'stay-calendar';
    calendar.hidden = true;
    body.append(calendar);
    card.append(body);
    part('stay').replaceChildren(card);
}

/** Whether a stay is booked: the panel's "Find a stay" button is only there until one is. */
export function hasStay(): boolean {
    return part('stay').querySelector('.tc-stay') !== null;
}

export function markInCalendar(): void {
    const mark = root().querySelector<HTMLElement>('[data-tc="stay-calendar"]');
    if (mark) mark.hidden = false;
}

// ── The notice ───────────────────────────────────────────────────────────────────────────────

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * A short line over the chat, gone after a few seconds. What a screen reader hears is a live
 * region that is always on the page (`announce`): one that appears with its text is often not read.
 */
export function notify(text: string): void {
    const notice = part('notice');
    part('notice-text').textContent = text;
    part('announce').textContent = text;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        notice.hidden = true;
    }, 3200);
}
