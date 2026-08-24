/**
 * The three levers a consumer reaches for, applied live from React.
 *
 * This exists to answer a question no other example asks: does aparté's config
 * seam — one global object plus a `window` event — survive a framework? React
 * re-renders on its own schedule and owns its own tree, so "call a setter on a
 * global and every mounted component updates" is a claim that has to be tried,
 * not assumed. Nothing in this file is aparté-specific plumbing: it is what an
 * app writes.
 *
 * Three deliberate details:
 *
 *  - **The palette goes on `:root`, not on the element.** `--aparte-primary` is
 *    the master and dozens of core's variables derive from it, but those derived
 *    declarations live on `:root`, so their values were substituted there and
 *    only inherit downwards. Setting the master lower moves the send button and
 *    leaves the avatar and the accent behind. `:root` is the level that works.
 *  - **Icons are a provider, not CSS.** Every key is optional and falls back to
 *    core's own glyph, so `{}` is the reset and a partial set is legal.
 *  - **The locale is a plain object of forty strings.** `@aparte/locale-fr` is
 *    one; your own language needs no package.
 */
import { aparteGlobalConfig, type AparteIconProvider } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

export type PaletteName = 'default' | 'violet' | 'paper';
export type IconSetName = 'default' | 'hard';
export type LanguageName = 'en' | 'fr';

/** Variables each palette sets, on `:root` — see the note above. */
const PALETTES: Record<PaletteName, Record<string, string>> = {
    default: {},
    violet: {
        '--aparte-primary': '#7c5cff',
        '--aparte-primary-hover': '#9a80ff',
        '--aparte-accent': '#7c5cff',
        '--aparte-avatar-bg-user': '#7c5cff',
        '--aparte-radius-bubble': '14px',
    },
    paper: {
        '--aparte-primary': '#8a6d1f',
        '--aparte-primary-hover': '#6f5716',
        '--aparte-accent': '#8a6d1f',
        '--aparte-avatar-bg-user': '#8a6d1f',
        '--aparte-radius-bubble': '5px',
    },
};

const ALL_PALETTE_VARS = [...new Set(Object.values(PALETTES).flatMap((p) => Object.keys(p)))];

export function applyPalette(name: PaletteName): void {
    const root = document.documentElement;
    for (const v of ALL_PALETTE_VARS) root.style.removeProperty(v);
    for (const [k, v] of Object.entries(PALETTES[name] ?? {})) root.style.setProperty(k, v);
}

/** Square caps, miter joins — visibly a different family from core's own set. */
const line = (d: string) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"`
    + ` stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${d}</svg>`;

const ICON_SETS: Record<IconSetName, AparteIconProvider> = {
    // An empty provider IS the reset: every key falls back to core's glyph.
    default: {},
    hard: {
        send: () => line('<path d="M3 11l18-8-8 18-2-8-8-2z"/>'),
        paperclip: () => line('<path d="M8 11l7-7a4 4 0 1 1 6 6l-9 9a6 6 0 1 1-8-8l8-8"/>'),
        copy: () => line('<rect x="4" y="4" width="12" height="14"/><rect x="8" y="6" width="12" height="14"/>'),
        retry: () => line('<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 20v-6h6"/>'),
        stop: () => line('<rect x="6" y="6" width="12" height="12"/>'),
        check: () => line('<path d="M4 12l5 6 11-14"/>'),
        close: () => line('<path d="M5 5l14 14"/><path d="M19 5L5 19"/>'),
    },
};

export function applyIconSet(name: IconSetName): void {
    aparteGlobalConfig.setIconProvider(ICON_SETS[name] ?? {});
}

export function applyLanguage(name: LanguageName): void {
    if (name === 'fr') aparteGlobalConfig.setLocale(fr);
    else aparteGlobalConfig.resetLocale();
}
