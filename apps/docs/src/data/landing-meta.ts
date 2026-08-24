/**
 * The landing page's title and description — ONE copy.
 *
 * There were four before this file: the `<title>`, `<meta name="description">`,
 * the Open Graph pair, the Twitter pair, and a fifth hardcoded inside
 * `src/pages/og/[...slug].ts` for the social card. The card's copy had already
 * drifted — it was missing the closing "Zero runtime dependencies." clause, and
 * because astro-og-canvas bakes the string into a PNG, the image people saw when
 * they shared the link literally said less than the text tags beside it.
 *
 * The comment in that file asked the next person to keep the two in step by hand.
 * They went out of step twice in one afternoon. So: one export, imported by both.
 */

export const LANDING_TITLE = 'aparté — AI chat in Web Components, with the agent loop inside';

export const LANDING_DESCRIPTION =
    'AI chat in Web Components with the agent loop inside: tools that pause for human '
    + 'approval, branch-and-retry, ten kinds of content in one turn. Zero runtime dependencies.';

/**
 * What the social card's 1200x630 image actually shows, for `og:image:alt`.
 *
 * Written from the card as it renders (see LANDING_CARD_TITLE below and the layout
 * in src/pages/og/[...slug].ts): a brass rule down the leading edge, the aparté
 * mascot, then the claim in large type over the supporting line. It described the
 * PREVIOUS card for one build — an alt that lies is worse than no alt, so it lives
 * beside the strings it describes.
 */
export const LANDING_IMAGE_ALT =
    'A dark card with a brass edge and the aparté mascot, headed “AI chat in Web '
    + 'Components”, over the line “With the agent loop inside: tools that pause for '
    + 'human approval, branch-and-retry, ten kinds of content in one turn.”';

/*
 * The social card is not the same shape as a meta tag: astro-og-canvas renders its
 * title at 62px and its description at 30px, over a 72px logo that already carries
 * the wordmark. So the card said "aparté" in 62px type — the one thing the logo
 * beside it was already saying — and spent its large slot on nothing.
 *
 * These are the SAME sentence as LANDING_DESCRIPTION, cut where the type sizes cut
 * it: the claim big, the evidence small. Kept next to it so the three can be read
 * together and cannot drift apart in separate files, which is exactly what happened
 * before this module existed.
 */
export const LANDING_CARD_TITLE = 'AI chat in Web Components';

export const LANDING_CARD_BODY =
    'With the agent loop inside: tools that pause for human approval, branch-and-retry, '
    + 'ten kinds of content in one turn. Zero runtime dependencies.';
