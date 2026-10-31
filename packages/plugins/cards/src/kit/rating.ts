/**
 * A rating: stars filled to the value, the value, and how many reviews it averages.
 *
 * Two rows of the same five stars, the coloured one clipped to the value's width, so
 * 4.6 shows six tenths of the fifth star. Read aloud as one sentence ("Rated 4.6 out
 * of 5, 1,284 reviews"); the stars themselves are hidden from a screen reader.
 */
import type { CardContext } from './define.js';
import { el, glyph } from './dom.js';
import { formatNumber } from './format.js';
import { KIT_WORDS, word } from './strings.js';

const STAR = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z';
const FIVE = `<svg viewBox="0 0 120 24" xmlns="http://www.w3.org/2000/svg">${[0, 24, 48, 72, 96].map((x) => `<path transform="translate(${x} 0)" d="${STAR}"/>`).join('')}</svg>`; // safe-attr: this package's own glyph constants and loop numbers, never data // safe-text: this package's own SVG, built from its glyph constants

export interface RatingOptions {
    /** The scale's top (5 by default). */
    max?: number;
    /** How many reviews the value averages. */
    count?: number;
    /** Leave the number out and keep the stars. */
    starsOnly?: boolean;
}

/** The rating as an element, or `null` for no value. */
export function rating(ctx: CardContext, value: number | undefined, { max = 5, count, starsOnly = false }: RatingOptions = {}): HTMLElement | null {
    if (value === undefined || !Number.isFinite(value) || max <= 0) return null;
    const clamped = Math.max(0, Math.min(max, value));
    const stars = el('span', { class: 'aparte-rich-card__stars', attrs: { 'aria-hidden': 'true' } },
        glyph(FIVE, 'aparte-rich-card__stars-base'),
        glyph(FIVE, 'aparte-rich-card__stars-fill'));
    stars.style.setProperty('--aparte-rich-card-rating', `${(clamped / max) * 100}%`);
    const node = el('span', { class: 'aparte-rich-card__rating', attrs: { role: 'img' } }, stars);
    const shown = (n: number) => formatNumber(ctx.config, n, { maximumFractionDigits: 1 });
    if (!starsOnly) {
        const number = el('span', { class: 'aparte-rich-card__rating-value', attrs: { 'aria-hidden': 'true' } });
        ctx.bind(number, () => shown(clamped));
        node.append(number);
    }
    if (count !== undefined && Number.isFinite(count)) {
        const reviews = el('span', { class: 'aparte-rich-card__rating-count', attrs: { 'aria-hidden': 'true' } });
        ctx.bind(reviews, () => `(${formatNumber(ctx.config, count, { notation: count >= 10_000 ? 'compact' : 'standard' })})`);
        node.append(reviews);
    }
    ctx.bind(node, () => {
        const sentence = word(ctx.config, 'cardsRating', KIT_WORDS.cardsRating, { value: shown(clamped), max: shown(max) });
        return count !== undefined && Number.isFinite(count)
            ? `${sentence}, ${word(ctx.config, 'cardsReviews', KIT_WORDS.cardsReviews, { count: formatNumber(ctx.config, count) })}`
            : sentence;
    }, 'aria-label');
    return node;
}
