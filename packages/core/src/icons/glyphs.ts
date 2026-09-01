/**
 * The glyphs.
 *
 * ONE place. Every SVG the library draws is declared here and nowhere else, because
 * scattering them did not merely spread the source around — it let them DRIFT. Before
 * this file there were three different ✕ (a filled one on a 12 grid, a stroked one at
 * 2.5, and `close`), two different chevrons, and `paperclip` and `scrollDown` each
 * existed twice, byte for byte, in a component that could have asked for them.
 *
 * Each glyph is a plain string, exported on its own, so a bundler can drop the ones a
 * build never reaches. `APARTE_DEFAULT_ICON_FALLBACKS` in `config/icon-provider.ts`
 * assembles them into the record `getIcon()` reads — that record is indexed by a
 * computed key, so it is retained whole; anything meant to be optional has to stay OUT
 * of it. That is the rule the extended set follows.
 *
 * Drawn here, on the conventions every stroked icon set shares — a 24×24 grid,
 * `currentColor`, a 2px stroke with round caps and joins — so a consumer who swaps in
 * a set of their own under the same names gets the same optical weight. The path data
 * is core's own, which is what lets the package carry no notice and credit no set;
 * a glyph that needs redrawing is redrawn here, never pasted from elsewhere.
 * `icons/extended.ts` is the opt-in set and follows the same rule.
 */


/** Copy button icon — two sheets, the front one over the back one's corner. */
export const copyIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/></svg>`;

/** Success/check icon */
export const checkIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 9.5 17.5 19.5 7"/></svg>`;

/** Send message icon — a paper plane with its fold line. */
export const sendIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3.7 10.4a.9.9 0 0 0 .1 1.7l6.2 2 2 6.2a.9.9 0 0 0 1.7.1L21 3Z"/><path d="M10 14 21 3"/></svg>`;

/** Loading/spinner indicator */
export const loadingIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="aparte-icon aparte-icon-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;

/** Error indicator — a ring with an exclamation. */
export const errorIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.75v5"/><path d="M12 16.25h.01"/></svg>`;

/** Expand/show more icon */
export const expandIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 9.5 12 16l6.5-6.5"/></svg>`;

/** Collapse/show less icon */
export const collapseIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 14.5 12 8l6.5 6.5"/></svg>`;

/** Terminal/command prompt icon — a prompt chevron and a cursor line. */
export const terminalIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5 10.5 12 5 17.5"/><path d="M13 18h6"/></svg>`;

/** File attachment / paperclip icon */
export const paperclipIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.4 21a5.2 5.2 0 0 1-3.7-8.9l8.6-8.6a3.5 3.5 0 0 1 4.9 4.9l-8.6 8.6a1.7 1.7 0 0 1-2.5-2.5l7.4-7.4"/></svg>`;

/** Image file icon — a frame, a sun, a hill. */
export const imageIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="M20.5 15.5l-4-4-8 8"/></svg>`;

/** Generic file icon — a sheet with a folded corner. */
export const fileIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5Z"/><path d="M13.5 3v5.5H19"/></svg>`;

/** Scroll to bottom button icon */
export const scrollDownIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v15"/><path d="M6 13.5l6 6 6-6"/></svg>`;

/** Retry / regenerate icon — an arc back onto itself. */
export const retryIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.5"/><path d="M4 3.5v5h5"/></svg>`;

/** Edit / pencil icon */
export const editIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5H6a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2V13"/><path d="M17.75 3.25a2.05 2.05 0 0 1 2.9 2.9l-9.15 9.15-3.9 1 1-3.9Z"/></svg>`;

/** Thumbs up / positive feedback icon */
export const thumbUpIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 10.5v10"/><path d="M6.5 10.5h3l3.2-6.4a1.75 1.75 0 0 1 3.3.8V9h4a2 2 0 0 1 2 2.35l-1.3 7.3a2 2 0 0 1-2 1.6H9.5"/></svg>`;

/** Thumbs down / negative feedback icon */
export const thumbDownIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 13.5v-10"/><path d="M17.5 13.5h-3l-3.2 6.4a1.75 1.75 0 0 1-3.3-.8V15h-4a2 2 0 0 1-2-2.35l1.3-7.3a2 2 0 0 1 2-1.6h9.1"/></svg>`;

/** Previous branch arrow */
export const prevBranchIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6 9 12l5.5 6"/></svg>`;

/** Next branch arrow */
export const nextBranchIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6 15 12l-5.5 6"/></svg>`;

/** Tool call indicator (wrench) */
export const toolIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5a5.5 5.5 0 0 0-5.1 7.6L3.5 17l3.5 3.5 5.9-5.9a5.5 5.5 0 0 0 7.6-5.1l-3.1 3.1-2.7-.8-.8-2.7 3.1-3.1Z"/></svg>`;

/** Close / failed / rejected / remove (✕) */
export const closeIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/></svg>`;

/** Stop / halt streaming (■) */
export const stopIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>`;

/** Informational notice (ⓘ) */
export const infoIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.25"/><path d="M12 7.75h.01"/></svg>`;

/** Archive a conversation */
export const archiveIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 11 15 14"/><line x1="12" y1="11" x2="12" y2="19"/></svg>`;

/** Restore an archived conversation */
export const unarchiveIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 17 15 14"/><line x1="12" y1="11" x2="12" y2="17"/></svg>`;

/** Download / save to disk */
export const downloadIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12m0 0-4.5-4.5M12 15.5l4.5-4.5M4.5 20h15"/></svg>`;

/** Overflow menu of a row (⋯) — the conversation list's actions button. */
export const moreIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/></svg>`;

/** Pin a conversation to the top of the list — a pushpin: head, body, needle. */
export const pinIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5h7"/><path d="M10 3.5v5l-3 3.5V14h10v-2l-3-3.5v-5"/><path d="M12 14v6.5"/></svg>`;

/** Delete — a bin with its lid and two slats. */
export const trashIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M8 7V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 5v2"/><path d="m6.5 7 .8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10 11v5.5M14 11v5.5"/></svg>`;

/** Every glyph, by name — the map `APARTE_DEFAULT_ICON_FALLBACKS` is built from. */
/** Open a navigation drawer (☰) */
export const menuIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M4.5 12h15M4.5 17h15"/></svg>`;

/** A warning (triangle) */
export const alertTriangleIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 4.3 2.9 18a1.5 1.5 0 0 0 1.3 2.3h15.6a1.5 1.5 0 0 0 1.3-2.3L13.3 4.3a1.5 1.5 0 0 0-2.6 0Z"/><path d="M12 9.5V14M12 17.2v.1"/></svg>`;

export const APARTE_ICON_GLYPHS = {
    copy: copyIcon,
    check: checkIcon,
    send: sendIcon,
    loading: loadingIcon,
    error: errorIcon,
    expand: expandIcon,
    collapse: collapseIcon,
    terminal: terminalIcon,
    paperclip: paperclipIcon,
    image: imageIcon,
    file: fileIcon,
    scrollDown: scrollDownIcon,
    retry: retryIcon,
    edit: editIcon,
    thumbUp: thumbUpIcon,
    thumbDown: thumbDownIcon,
    prevBranch: prevBranchIcon,
    nextBranch: nextBranchIcon,
    tool: toolIcon,
    close: closeIcon,
    stop: stopIcon,
    info: infoIcon,
    archive: archiveIcon,
    unarchive: unarchiveIcon,
    download: downloadIcon,
    more: moreIcon,
    pin: pinIcon,
    trash: trashIcon,
    menu: menuIcon,
    alertTriangle: alertTriangleIcon,
} as const;
