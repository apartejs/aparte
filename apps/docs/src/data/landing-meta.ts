/**
 * The landing page's title and description — ONE copy.
 *
 * There were four before this file: the `<title>`, `<meta name="description">`,
 * the Open Graph pair, the Twitter pair, and a fifth hardcoded inside
 * `src/pages/og/[...slug].ts` for the social card. The card's copy had already
 * drifted — it was missing the closing "Zero third-party dependencies." clause, and
 * because astro-og-canvas bakes the string into a PNG, the image people saw when
 * they shared the link literally said less than the text tags beside it.
 *
 * The comment in that file asked the next person to keep the two in step by hand.
 * They went out of step twice in one afternoon. So: one export, imported by both.
 */

/*
 * No figure in these strings. "6 kinds of content in one turn" was counted from the segment
 * list and read as a cap on a library whose turns also draw cards, charts, formulas and
 * diagrams; what the page offers is said in words instead.
 */

export const LANDING_TITLE = 'AI Chat Web Components: your backend, tools, cards | aparté';

export const LANDING_DESCRIPTION =
    'Open-source AI chat Web Components for React, Vue, Svelte, Angular or HTML: '
    + 'your OpenAI-compatible backend, tool calls, results drawn as interactive cards.';

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
    'A dark card with a brass edge and the aparté mascot, headed “AI chat Web '
    + 'Components”, over the line “Your OpenAI-compatible backend or AG-UI agent, tool '
    + 'calls with a person\'s approval, results drawn as interactive cards. React, Vue, '
    + 'Svelte, Angular or HTML.”';

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
export const LANDING_CARD_TITLE = 'AI chat Web Components';

export const LANDING_CARD_BODY =
    'Your OpenAI-compatible backend or AG-UI agent, tool calls with a person\'s '
    + 'approval, results drawn as interactive cards. React, Vue, Svelte, Angular or HTML.';
