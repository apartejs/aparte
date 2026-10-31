/**
 * Saltroad, the invented travel app this template is, and the people in it: its mark (a sail over
 * a wave, inline so the page requests nothing), the concierge the transcript names, and the
 * traveller whose trip it is. Template.astro draws the mark in the header; the avatars draw it too.
 */
export const MARK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M12 3v13"/><path d="M12 4.5 18 15h-6"/><path d="M12 7.5 7 15h5"/>'
    + '<path d="M3 19.5c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0"/></svg>';

export const BRAND = 'Saltroad';

/** The concierge, as the transcript names it. */
export const CONCIERGE = 'Mira';

/** The traveller signed in: the greeting uses the first name, the header the initials. */
export const TRAVELLER = { firstName: 'Sam', name: 'Sam Reyes', initials: 'SR' } as const;
