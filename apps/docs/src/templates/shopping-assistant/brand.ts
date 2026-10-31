/**
 * Pinecrate, the invented shop this template is the website of: its mark (a pine, inline so the
 * page requests nothing), the bag its cart wears, the assistant the chat speaks as, and the
 * customer who is signed in. Template.astro draws the marks; the avatars in the transcript draw
 * the mark from here too.
 */
export const SHOP_NAME = 'Pinecrate';

export const MARK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M12 3 7.5 9h2.5L6 14h3l-3.5 4.5h13L15 14h3l-4-5h2.5z"/><path d="M12 18.5V21"/></svg>';

/** The cart button's glyph: core's icon set has no bag, and a shop's cart is its own anyway. */
export const BAG_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/></svg>';

/** The assistant, as the transcript and the panel's header name it. */
export const ASSISTANT_NAME = 'Pip';

/** The signed-in customer: the orders and the return are theirs. */
export const CUSTOMER = {
    firstName: 'Alex',
    name: 'Alex Moreau',
    email: 'alex@example.com',
    card: 'Visa •••• 4242',
    address: 'Alex Moreau\n8 rue du Marché\n59000 Lille\nFrance',
} as const;
