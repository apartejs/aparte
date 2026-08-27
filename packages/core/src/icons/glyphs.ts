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
 * Shapes follow Lucide's grid (24x24, `currentColor`, round caps) so a consumer who
 * swaps in the real Lucide gets the same drawing under the same name. Nothing is
 * imported from it: core has no dependencies.
 */


/** Copy button icon */
export const copyIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/** Success/check icon */
export const checkIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

/** Send message icon */
export const sendIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

/** Loading/spinner indicator */
export const loadingIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="aparte-icon aparte-icon-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;

/** Error indicator */
export const errorIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

/** Expand/show more icon */
export const expandIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

/** Collapse/show less icon */
export const collapseIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;

/** Terminal/command prompt icon */
export const terminalIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;

/** File attachment / paperclip icon */
export const paperclipIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

/** Image file icon */
export const imageIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

/** Generic file icon */
export const fileIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;

/** Scroll to bottom button icon */
export const scrollDownIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;

/** Retry / regenerate icon */
export const retryIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

/** Edit / pencil icon */
export const editIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

/** Thumbs up / positive feedback icon */
export const thumbUpIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;

/** Thumbs down / negative feedback icon */
export const thumbDownIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`;

/** Previous branch arrow */
export const prevBranchIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

/** Next branch arrow */
export const nextBranchIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

/** Tool call indicator (wrench) */
export const toolIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

/** Close / failed / rejected / remove (✕) */
export const closeIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/** Stop / halt streaming (■) */
export const stopIcon = `<svg class="aparte-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>`;

/** Informational notice (ⓘ) */
export const infoIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

/** Archive a conversation */
export const archiveIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 11 15 14"/><line x1="12" y1="11" x2="12" y2="19"/></svg>`;

/** Restore an archived conversation */
export const unarchiveIcon = `<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 17 15 14"/><line x1="12" y1="11" x2="12" y2="17"/></svg>`;

/** Download / save to disk */
export const downloadIcon = `<svg class="aparte-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9m0 0l-3-3m3 3l3-3M2 13h12"/></svg>`;

/** Every glyph, by name — the map `APARTE_DEFAULT_ICON_FALLBACKS` is built from. */
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
} as const;
