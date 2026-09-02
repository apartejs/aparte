/**
 * The extended set — glyphs core itself never draws.
 *
 * SEPARATE ON PURPOSE, and the reason is mechanical rather than editorial.
 * `APARTE_DEFAULT_ICON_FALLBACKS` is read by a computed key (`getIcon(name)`), so a
 * bundler cannot tell which of its entries a build reaches and keeps the object whole.
 * Anything added there ships to every consumer, used or not. These are individual
 * exports behind their own entry point instead:
 *
 *     import { searchIcon, trashIcon } from '@aparte/core/icons';
 *
 * Import three, pay for three. Nothing here is loaded by `@aparte/core` itself, so a
 * consumer who never opens this module pays nothing at all — the same lever as
 * `@aparte/plugin-shiki/core` (ratified decision #9b: weight is controlled by an entry
 * point, never by a flag).
 *
 * Drawn here, like `glyphs.ts`: a 24-unit grid, a 2-unit round-capped stroke,
 * `currentColor`, no size (the container declares `--aparte-icon-size`). The names are
 * the plain words for what each one shows — search, trash, folder — so a consumer can
 * find one without a legend. Nothing is imported from anywhere: core has no
 * dependencies, and the path data is ours.
 *
 * To wire one to a name core knows, pass it through an icon provider:
 *
 *     aparteGlobalConfig.setIconProvider({ retry: () => historyIcon });
 */

import { prevBranchIcon, nextBranchIcon, moreIcon, trashIcon } from './glyphs.js';

/** Add */
export const plusIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v15M4.5 12h15"/></svg>`;

/** Remove */
export const minusIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h15"/></svg>`;

/** Search a list or a transcript */
export const searchIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5.5 5.5"/></svg>`;

/** Filter a list */
export const filterIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4.5h17l-6.5 8v6.5l-4 2v-8.5Z"/></svg>`;

/** Overflow menu, in a row. The conversation list draws it, so the path lives in
 *  `glyphs.ts` as `more` — this is the alias under its shape name, like the chevrons. */
export const moreHorizontalIcon = moreIcon;

/** Overflow menu, in a column */
export const moreVerticalIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="12" cy="18.5" r="1.1"/></svg>`;

/** Previous. The same drawing the branch picker uses, under its shape name rather
 *  than its role name — an alias, so the path ships once. */
export const chevronLeftIcon = prevBranchIcon;

/** Next. Alias of the branch picker glyph — see chevronLeftIcon. */
export const chevronRightIcon = nextBranchIcon;

/** Send upward / move up */
export const arrowUpIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5"/></svg>`;

/** Continue / go to */
export const arrowRightIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/></svg>`;

/** Opens outside the app */
export const externalLinkIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13"/><path d="M14.5 4.5h5v5M19.5 4.5 11 13"/></svg>`;

/** A hyperlink */
export const linkIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L12 6.34"/><path d="M13.5 10.5a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66L12 17.66"/></svg>`;

/** A directory */
export const folderIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4.2l2 2h7.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2Z"/></svg>`;

/** Source code */
export const codeIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 4.5 4.5-4.5 4.5M8.5 7.5 4 12l4.5 4.5"/></svg>`;

/** Paste / a clipboard */
export const clipboardIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 4.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5M9 11h6M9 15h4"/></svg>`;

/** Delete for good */
/* `trashIcon` moved to `glyphs.ts` when the conversation list's menu started drawing
   it; it is re-exported below so `import { trashIcon } from '@aparte/core/icons'` holds. */
export { trashIcon };

/** Save to disk */
export const saveIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h11l3.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z"/><path d="M8 20.5v-6h8v6M8 4.5v4h5"/></svg>`;

/** Send a file up */
export const uploadIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/></svg>`;

/** Preferences */
export const settingsIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>`;

/** A person */
export const userIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20.5a7 7 0 0 1 14 0"/></svg>`;

/** The assistant */
export const botIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8.5" width="16" height="11" rx="3"/><path d="M12 8.5V5.5M8.5 13.5V15M15.5 13.5V15"/><circle cx="12" cy="4.5" r="1"/></svg>`;

/** Generated by a model */
export const sparklesIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8Z"/><path d="M19 16.5c.25 1.6 1.15 2.5 2.75 2.75-1.6.25-2.5 1.15-2.75 2.75-.25-1.6-1.15-2.5-2.75-2.75 1.6-.25 2.5-1.15 2.75-2.75Z"/></svg>`;

/** Local / on-device compute */
export const cpuIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V5M15 2.5V5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/></svg>`;

/** A store */
export const databaseIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/></svg>`;

/** Remote / the network */
export const globeIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18"/></svg>`;

/** A credential */
export const keyIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l2.5 2.5M14.5 8.5l2 2"/></svg>`;

/** Speak */
export const micIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6"/></svg>`;

/** Muted */
export const micOffIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10.5V6a3 3 0 0 0-5.7-1.3"/><path d="M9 9.5V11a3 3 0 0 0 4.9 2.3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 10.2 5.3M18.5 11.5a6.4 6.4 0 0 1-.3 2"/><path d="M12 18v3.5M9 21.5h6M4 4l16 16"/></svg>`;

/** Shown */
export const eyeIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12c2.2-4.2 5.4-6.5 9.5-6.5s7.3 2.3 9.5 6.5c-2.2 4.2-5.4 6.5-9.5 6.5S4.7 16.2 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;

/** Hidden */
export const eyeOffIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6.1A9.6 9.6 0 0 1 12 5.5c4.1 0 7.3 2.3 9.5 6.5a15.7 15.7 0 0 1-2.7 3.6"/><path d="M6.3 7.7A14 14 0 0 0 2.5 12c2.2 4.2 5.4 6.5 9.5 6.5a9.6 9.6 0 0 0 3.4-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16"/></svg>`;

/** Duration / pending */
export const clockIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/></svg>`;

/** Past conversations */
export const historyIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v5h5M12 7.5V12l3 1.8"/></svg>`;

/** Favourite */
export const starIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 14.5 9.1 21 9.6 16 13.8 17.6 20.2 12 16.7 6.4 20.2 8 13.8 3 9.6 9.5 9.1"/></svg>`;

/** Send elsewhere */
export const shareIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/></svg>`;

/** Done, emphatically */
export const checkCircleIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8 5.7-5.5"/></svg>`;

/** Failed, emphatically */
export const xCircleIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>`;

/** A conversation */
export const messageSquareIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9.5L4.5 21V6.5A2.5 2.5 0 0 1 6.5 4Z"/></svg>`;

/** Light theme */
export const sunIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>`;

/** Dark theme */
export const moonIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

/** Every extended glyph, by name. Importing this object defeats tree-shaking:
 *  it is here for a gallery or a picker, not for drawing one icon. */
export const APARTE_EXTENDED_ICON_GLYPHS = {
    plus: plusIcon,
    minus: minusIcon,
    search: searchIcon,
    filter: filterIcon,
    moreHorizontal: moreHorizontalIcon,
    moreVertical: moreVerticalIcon,
    chevronLeft: chevronLeftIcon,
    chevronRight: chevronRightIcon,
    arrowUp: arrowUpIcon,
    arrowRight: arrowRightIcon,
    externalLink: externalLinkIcon,
    link: linkIcon,
    folder: folderIcon,
    code: codeIcon,
    clipboard: clipboardIcon,
    trash: trashIcon,
    save: saveIcon,
    upload: uploadIcon,
    settings: settingsIcon,
    user: userIcon,
    bot: botIcon,
    sparkles: sparklesIcon,
    cpu: cpuIcon,
    database: databaseIcon,
    globe: globeIcon,
    key: keyIcon,
    mic: micIcon,
    micOff: micOffIcon,
    eye: eyeIcon,
    eyeOff: eyeOffIcon,
    clock: clockIcon,
    history: historyIcon,
    star: starIcon,
    share: shareIcon,
    checkCircle: checkCircleIcon,
    xCircle: xCircleIcon,
    messageSquare: messageSquareIcon,
    sun: sunIcon,
    moon: moonIcon,
} as const;
