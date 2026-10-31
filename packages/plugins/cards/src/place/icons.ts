/**
 * The place card's glyphs: one 24 × 24 line drawing each, in `currentColor`, so the sheet
 * colours them with the text around them — the pin, the three actions' signs, and one
 * glyph per kind of place for the placeholder and the badge.
 *
 * They live here and not in core's `icons/`: core draws no place. They are constants of
 * the package, the only markup the card parses.
 */

/** The kinds of place a glyph (and a word) exists for; anything else is a `place`. */
export type PlaceKind = 'restaurant' | 'cafe' | 'bar' | 'hotel' | 'shop' | 'museum' | 'park' | 'gym' | 'pharmacy' | 'place';

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

export const PIN = svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>');
export const PHONE = svg('<path d="M5.2 4h3l1.6 4-2 1.3a10.5 10.5 0 0 0 5 5l1.3-2 4 1.6v3a2 2 0 0 1-2.1 2A15.2 15.2 0 0 1 3.2 6.1 2 2 0 0 1 5.2 4z"/>');
export const GLOBE = svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>');
export const DIRECTIONS = svg('<path d="M12 2.8 21.2 12 12 21.2 2.8 12z"/><path d="M9.2 14.6v-2.4a1.4 1.4 0 0 1 1.4-1.4h4.6M13.4 8.8l1.9 2-1.9 2"/>');
export const CLOCK = svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');

const KIND_GLYPHS: Record<PlaceKind, string> = {
    restaurant: svg('<path d="M7 3v18M4.6 3v4.8A2.4 2.4 0 0 0 7 10.2a2.4 2.4 0 0 0 2.4-2.4V3M17 21V3c-2.3 1.4-3.5 4-3.5 7.2V13H17"/>'),
    cafe: svg('<path d="M4.5 9h11v5.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5z"/><path d="M15.5 10.5h1.3a2.6 2.6 0 0 1 0 5.2h-1.6M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5"/>'),
    bar: svg('<path d="M5 4h14l-7 8z"/><path d="M12 12v8M8.5 20h7M8.6 8h6.8"/>'),
    hotel: svg('<path d="M3 18.5V6M3 14h18v4.5M21 14v-2.5a3 3 0 0 0-3-3h-7V14"/><circle cx="7" cy="10.5" r="1.8"/>'),
    shop: svg('<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
    museum: svg('<path d="M3.5 9.5 12 4l8.5 5.5zM5 20.5h14M6.5 11.5v6.5M10 11.5v6.5M14 11.5v6.5M17.5 11.5v6.5"/>'),
    park: svg('<path d="M12 21v-5M12 3 6.5 11h3L6 16h12l-3.5-5h3z"/>'),
    gym: svg('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
    pharmacy: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
    place: PIN,
};

/** The glyph for a kind of place. */
export function kindGlyph(kind: PlaceKind): string {
    return KIND_GLYPHS[kind];
}
