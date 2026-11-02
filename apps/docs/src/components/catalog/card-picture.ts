/**
 * A card's pictures (public/cards/, written by scripts/shoot-cards.mjs) and their size, for
 * `<Variant poster>` and the card pages' og:image. A missing picture fails the build: a page
 * that promises one must have it, and the fix is to run the script.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The shots are taken at twice the CSS size, so they stay sharp on a dense screen. */
const SCALE = 2;

export function cardPicture(card: string, title: string): { light: string; dark: string; alt: string; width: number; height: number } {
    const file = resolve('public/cards', `${card}.png`);
    let png: Buffer;
    try {
        png = readFileSync(file);
    } catch {
        throw new Error(`<Variant poster="${card}">: no ${file}. Run node apps/docs/scripts/shoot-cards.mjs.`);
    }
    // A PNG's width and height are the IHDR chunk's first two words, at bytes 16 and 20.
    return {
        light: `/cards/${card}.png`,
        dark: `/cards/${card}-dark.png`,
        alt: `${title}, in an aparté chat`,
        width: Math.round(png.readUInt32BE(16) / SCALE),
        height: Math.round(png.readUInt32BE(20) / SCALE),
    };
}
