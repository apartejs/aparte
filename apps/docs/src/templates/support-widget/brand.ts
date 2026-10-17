/**
 * Kilnhouse, the invented product whose website hosts the widget: its mark (a pot with a band,
 * inline so the page requests nothing) and the people the chat speaks as. Template.astro draws the
 * mark in the site's header and the panel's; the avatars in the transcript draw it from here too.
 */
export const MARK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M9 3h6M10 3v2.6c0 1.4-4 3.4-4 7.9C6 17.6 8.5 21 12 21s6-3.4 6-7.5c0-4.5-4-6.5-4-7.9V3"/><path d="M6.6 13.5h10.8"/></svg>';

/** The assistant, as the transcript names it. */
export const ASSISTANT_NAME = 'Wren';

/** The person a handoff brings in. */
export const AGENT = { name: 'Rosa Lindqvist', firstName: 'Rosa', initials: 'RL', team: 'Customer Care' } as const;
