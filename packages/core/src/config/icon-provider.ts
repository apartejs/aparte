/**
 * Icon Provider Interface
 * 
 * Defines the contract for icon plugins.
 * Returns HTML strings: SVG, <i> tags, emojis, or any valid HTML.
 * 
 * @example
 * // Register an icon provider (e.g. a FontAwesome bridge)
 * aparteGlobalConfig.setIconProvider({
 *   copy: () => '<i class="fas fa-copy"></i>',
 *   check: () => '<i class="fas fa-check"></i>',
 *   // ...
 * });
 */
import { APARTE_ICON_GLYPHS } from '../icons/glyphs.js';

export interface AparteIconProvider {
    // EVERY key is optional: `aparteGlobalConfig.getIcon()` falls back to
    // `APARTE_DEFAULT_ICON_FALLBACKS` for any name a provider doesn't implement, so an
    // icon pack may cover just the icons it cares about (as the example above
    // shows). Requiring the full set made the type contradict the runtime and
    // forced consumers — and this repo's own tests — into `as any`.
    /** Copy button icon */
    copy?: () => string;
    /** Success/check icon */
    check?: () => string;
    /** Send message icon */
    send?: () => string;
    /** Loading/spinner indicator */
    loading?: () => string;
    /** Error indicator */
    error?: () => string;
    /** Expand/show more icon */
    expand?: () => string;
    /** Collapse/show less icon */
    collapse?: () => string;
    /** Terminal/command prompt icon */
    terminal?: () => string;
    /** File attachment / paperclip icon (used by upload plugin) */
    paperclip?: () => string;
    /** Image file icon (used by upload plugin) */
    image?: () => string;
    /** Generic file icon (used by upload plugin) */
    file?: () => string;
    /** Scroll to bottom button icon */
    scrollDown?: () => string;
    /** Retry / regenerate icon */
    retry?: () => string;
    /** Edit / pencil icon */
    edit?: () => string;
    /** Thumbs up / positive feedback icon */
    thumbUp?: () => string;
    /** Thumbs down / negative feedback icon */
    thumbDown?: () => string;
    /** Previous branch arrow */
    prevBranch?: () => string;
    /** Next branch arrow */
    nextBranch?: () => string;
    /** Tool call indicator (wrench) */
    tool?: () => string;
    /** Close / failed / rejected (✕) */
    close?: () => string;
    /** Stop / halt streaming (■) */
    stop?: () => string;
    /** Informational notice (ⓘ) */
    info?: () => string;
    /** Archive a conversation */
    archive?: () => string;
    /** Restore an archived conversation */
    unarchive?: () => string;
    /** Download / save to disk */
    download?: () => string;
    /** A row's actions button (⋯) */
    more?: () => string;
    /** Pin a conversation */
    pin?: () => string;
    /** Delete (a bin) */
    trash?: () => string;
}

/** Icon names available in the provider */
export type AparteIconName = keyof AparteIconProvider;

/**
 * The default drawing for every name, assembled from `icons/glyphs.ts`.
 *
 * `getIcon()` reads this by a COMPUTED key, so a bundler cannot tell which entries a
 * build reaches and keeps the object whole. That is the constraint that shapes the icon
 * set: what belongs here is what core itself draws, and nothing else — an icon nobody
 * renders would still ship to everybody. Extra glyphs are individual exports a consumer
 * imports by name, never members of this record.
 */
export const APARTE_DEFAULT_ICON_FALLBACKS: Record<AparteIconName, string> = APARTE_ICON_GLYPHS;

