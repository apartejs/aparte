/**
 * The link card's glyphs: the chain that names the card, one small badge per kind of page
 * (an article, a video, a code repository, a product), and the play disc a video's preview
 * wears.
 *
 * Drawn on a 24 × 24 grid in `currentColor`, so the sheet colours them through `color` and
 * a theme follows. Constants of this package — the only markup the card parses.
 */
import type { LinkType } from './index.js';

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** Two links of a chain: a link, and the card's one-line state glyph. */
export const CHAIN = svg('<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>');

/** The play triangle, filled: it sits on a disc over a video's preview. */
export const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L10 4.74a1 1 0 0 0-1.5.86z"/></svg>';

const TYPE_GLYPHS: Record<Exclude<LinkType, 'website'>, string> = {
    // A page of lines.
    article: svg('<path d="M6.5 3.5h8l3.5 3.5v12.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14 3.5V7h4M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5"/>'),
    // A screen with the triangle.
    video: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.2 9.4 4.4 2.6-4.4 2.6z"/>'),
    // A branch: two commits and the line between them.
    repo: svg('<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 8v8M17 10c0 3.5-4 3.5-8.5 6.5"/>'),
    // A price tag.
    product: svg('<path d="M3.8 12.6 11.4 5a2 2 0 0 1 1.4-.6h5.3a1.5 1.5 0 0 1 1.5 1.5v5.3a2 2 0 0 1-.6 1.4l-7.6 7.6a1.5 1.5 0 0 1-2.1 0l-5.5-5.5a1.5 1.5 0 0 1 0-2.1z"/><circle cx="15.6" cy="8.4" r="1.3"/>'),
};

/** The badge glyph for a kind of page; a plain website has none. */
export function typeGlyph(type: Exclude<LinkType, 'website'>): string {
    return TYPE_GLYPHS[type];
}
