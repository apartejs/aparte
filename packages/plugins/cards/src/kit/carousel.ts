/**
 * A row of slides that scrolls sideways: products, places, articles.
 *
 * Native scrolling with snap points, so touch, trackpad, wheel and keyboard (the track is
 * focusable; arrows scroll it) all work as the platform does. Two buttons step a slide at
 * a time and switch off at each end; they are not drawn when everything fits. Announced as
 * a carousel, each slide as "2 of 5" (the WAI-ARIA carousel pattern, without auto-play:
 * nothing here moves on its own).
 */
import { bindMarkup, type CardContext } from './define.js';
import { el } from './dom.js';
import { formatNumber } from './format.js';
import { KIT_WORDS, word } from './strings.js';

export interface CarouselOptions {
    /** The carousel's accessible name ("Products"); its slides are counted inside it. */
    label?: () => string;
}

/** The slides in a scrolling row, with its two buttons. */
export function carousel(ctx: CardContext, slides: HTMLElement[], { label }: CarouselOptions = {}): HTMLElement {
    // Focusable so the arrow keys scroll it — and then named, since a focus stop must say what
    // it is. Without a label the two buttons are the keyboard's way through.
    const track = el('div', { class: 'aparte-rich-card__track', attrs: label ? { tabindex: 0 } : {} });
    if (label) ctx.bind(track, label, 'aria-label');
    slides.forEach((slide, i) => {
        const wrap = el('div', { class: 'aparte-rich-card__slide', attrs: { role: 'group', 'aria-roledescription': 'slide' } }, slide);
        ctx.bind(wrap, () => word(ctx.config, 'cardsSlide', KIT_WORDS.cardsSlide, { n: formatNumber(ctx.config, i + 1), total: formatNumber(ctx.config, slides.length) }), 'aria-label');
        track.append(wrap);
    });

    const button = (dir: -1 | 1) => {
        const b = el('button', {
            class: `aparte-btn aparte-btn--icon aparte-btn--sm aparte-btn--surface aparte-rich-card__nav aparte-rich-card__nav--${dir < 0 ? 'prev' : 'next'}`,
            attrs: { type: 'button' },
        });
        bindMarkup(b, () => ctx.config.getIcon(dir < 0 ? 'prevBranch' : 'nextBranch'));
        ctx.bind(b, () => word(ctx.config, dir < 0 ? 'cardsPrevious' : 'cardsNext', dir < 0 ? KIT_WORDS.cardsPrevious : KIT_WORDS.cardsNext), 'aria-label');
        b.addEventListener('click', () => step(dir));
        return b;
    };
    const prev = button(-1);
    const next = button(1);
    // A region is a landmark, and a landmark needs a name: without a label it is a plain box.
    const root = el('div', { class: 'aparte-rich-card__carousel', attrs: label ? { role: 'region', 'aria-roledescription': 'carousel' } : {} }, track, prev, next);
    if (label) ctx.bind(root, label, 'aria-label');

    const rtl = () => typeof getComputedStyle === 'function' && getComputedStyle(track).direction === 'rtl';
    function step(dir: -1 | 1): void {
        const slide = track.firstElementChild as HTMLElement | null;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        const by = ((slide?.offsetWidth ?? track.clientWidth) + gap) * dir * (rtl() ? -1 : 1);
        const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        track.scrollBy({ left: by, behavior: still ? 'auto' : 'smooth' });
    }
    function sync(): void {
        // In a right-to-left page `scrollLeft` runs from 0 down to a negative number.
        const at = Math.abs(track.scrollLeft);
        const room = track.scrollWidth - track.clientWidth;
        root.toggleAttribute('data-overflow', room > 1);
        // A button switched off while it holds the focus would drop it on the page: the
        // focus moves to the other button (or the track) first.
        const active = typeof document === 'undefined' ? null : document.activeElement;
        prev.disabled = at <= 1;
        next.disabled = at >= room - 1;
        if (active === prev && prev.disabled) (next.disabled ? track : next).focus({ preventScroll: true });
        if (active === next && next.disabled) (prev.disabled ? track : prev).focus({ preventScroll: true });
    }
    let frame = 0;
    track.addEventListener('scroll', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(sync);
    }, { passive: true });
    if (typeof ResizeObserver === 'function') {
        // A card has no teardown hook: the observer lets itself go once the track has left
        // the page (a removal reports a size change).
        const watch = new ResizeObserver(() => {
            if (!track.isConnected) { watch.disconnect(); return; }
            sync();
        });
        watch.observe(track);
    }
    sync();
    return root;
}
