/**
 * The links a reply holds, and an app that routes them.
 *
 * Every link the model writes opens in a new tab by default, same-site ones included: followed
 * in place, `[the setup notes](docs/setup.md)` would replace this page, and the conversation with
 * it. `?links=route` shows what an app with somewhere to put such a link does instead: the chat
 * hands it the link before the browser follows it (`aparte-link-click`, each framework's spelling
 * in its own App), the app keeps a same-site one — here it writes it down, a real one opens the
 * file or routes — and leaves another site to its new tab.
 */
import type { Scenario } from '@aparte/provider-scenario';

/** What the browser suite asks the scripted model. */
export const LINKS_PROMPT = 'Where are the setup notes?';

/** A reply with a same-site link, a link to another site, and a link to a place in the page. */
export const LINK_SCENARIOS: Record<string, Scenario> = {
    links: {
        when: /\bsetup notes\b/i,
        turn: [{ text: 'They are in [the setup notes](docs/setup.md), the API is in [the reference](https://example.com/reference), and the steps are [below](#steps).' }],
    },
};

/** `?links=route`: the app routes the same-site links a reply holds. */
const ROUTE_LINKS = new URLSearchParams(location.search).get('links') === 'route';

/** The links the app kept, oldest first: what its router would have been handed. The browser suite reads it. */
const routed: string[] = [];
(window as unknown as { __aparteRoutedLinks: string[] }).__aparteRoutedLinks = routed;

/**
 * Whether the app keeps the link to `href` rather than leave it to the browser: under
 * `?links=route`, a same-site one. Another site goes to its new tab, and `#…` stays in the page.
 */
export function routeLink(href: string): boolean {
    if (!ROUTE_LINKS || href.startsWith('#')) return false;
    if (new URL(href, location.href).origin !== location.origin) return false;
    routed.push(href);
    return true;
}
