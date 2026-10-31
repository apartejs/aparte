/**
 * The media card's glyphs: one line drawing per kind of medium (for the placeholder a
 * tile shows before, or instead of, its picture), the play triangle a video wears, the
 * stack of frames a gallery is named with, and the small marks of a caption line.
 *
 * Drawn on a 24 × 24 grid in `currentColor`, so the sheet colours them through `color`
 * and a theme follows. Constants of this package — the only markup the card parses.
 */
import type { MediaKind } from './index.js';

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** A framed landscape: an image. */
export const IMAGE = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4 17.5 4.6-4.6a1.4 1.4 0 0 1 2 0l3.4 3.4 1.6-1.6a1.4 1.4 0 0 1 2 0l2.9 2.9"/>');

/** A strip of film: a video. */
export const FILM = svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>');

/** A note: a sound. */
export const NOTE = svg('<path d="M9.5 17.5V6l10-2v11.5"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>');

/** Two frames, one behind the other: a gallery, and the card's one-line state glyph. */
export const FRAMES = svg('<rect x="7" y="3.5" width="13.5" height="11.5" rx="2.2"/><path d="M17 18.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><path d="m7.5 13 3-3 2.5 2.5 1.5-1.5 3.5 3.5"/>');

/** The play triangle, filled: it sits on a disc over a picture. */
export const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L10 4.74a1 1 0 0 0-1.5.86z"/></svg>';

/** Four corners pulled out: "see it larger", in the corner of a picture you can open. */
export const EXPAND = svg('<path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6"/>');

/** A box with an arrow leaving it: a page that opens elsewhere. */
export const EXTERNAL = svg('<path d="M13.5 4.5h6v6M19.5 4.5l-8 8"/><path d="M17.5 13.5v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4"/>');

/** A camera body: who took or made the picture. */
export const CAMERA = svg('<path d="M4.5 8h3l1.6-2.3h5.8L16.5 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.3"/>');

/** The glyph for a kind of medium. */
export function kindGlyph(kind: MediaKind): string {
    return kind === 'video' ? FILM : kind === 'audio' ? NOTE : IMAGE;
}
