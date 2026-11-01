import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import starlightChangelogs, { makeChangelogsSidebarLinks } from 'starlight-changelogs';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightLinksValidator from 'starlight-links-validator';
import { REDIRECTS } from './scripts/lib/redirects.mjs';
import { catalogueSidebar } from './scripts/lib/catalogue.mjs';
import { guideGroups } from './scripts/lib/guides.mjs';
import { CHANGELOG_COMPARE } from './src/lib/changelog-compare.mjs';
import { aparteCodeBlock, rehypeAparteAsides } from './src/lib/markdown.mjs';
import { LLMS_SETS } from './src/data/llms-sets.mjs';

// Dev only: read @aparte/core from source (see the `vite` block below). Production
// builds keep consuming the published `dist`, so deploys are unchanged.
const isDev = process.env.npm_lifecycle_event === 'dev';

// The Docs sidebar's groups, from each guide's own `guide.group` (scripts/lib/guides.mjs).
const guides = guideGroups();

/**
 * External links leave the site, so they open in their own tab.
 *
 * There are 250 of them across the guides and the changelog (243 to github.com
 * alone) and they are written as ordinary markdown, so none carried `target` or
 * `rel`. Fixing them one by one is 250 edits and a rule nobody will remember on
 * the 251st; this is one place.
 *
 * Hand-rolled rather than `rehype-external-links` + `unist-util-visit`: it is a
 * dozen lines over a tree we already have in memory, and it keeps a dependency
 * out of the docs app for something this small.
 *
 * `rel` is `noopener` and deliberately NOT `noreferrer` — the opener reference is
 * the security concern, while the Referer header is how GitHub and npm attribute
 * their traffic back to this site.
 */
const SITE_HOST = 'apartejs.dev';
function rehypeExternalLinksInOwnTab() {
    return (tree) => {
        const walk = (node) => {
            if (node.type === 'element' && node.tagName === 'a') {
                const href = node.properties?.href;
                if (typeof href === 'string' && /^https?:\/\//i.test(href) && !href.includes(SITE_HOST)) {
                    node.properties.target = '_blank';
                    node.properties.rel = ['noopener'];
                }
            }
            for (const child of node.children ?? []) walk(child);
        };
        walk(tree);
    };
}

// https://astro.build/config
/*
 * A RegExp rather than a quoted route, deliberately: `check:doc-links` reads
 * every quoted absolute route in this file as a route the site PROMISES, and fails the
 * build when no page is built there. That rule is right — the llms preamble once cited
 * `/kit/` while nothing rendered it — and this prefix is not a promise: it is where the
 * frames live, with no index of its own. Written as a path predicate rather than a
 * quoted route, it cannot be mistaken for a link — by the guard or by a reader.
 */
const PREVIEW_FRAME = /^\/preview\//;

export default defineConfig({
    /*
     * Astro's HTML compressor is on by default, and it strips the whitespace
     * BETWEEN a text node and an inline element — where that whitespace is the
     * word gap. The landing lost three of them: "7 kinds of content,human-in-the-
     * loop tools", "renders none of it.Register your own kind", and "...cannot
     * drift from the code.Read the reference". The markup was correct in all
     * three; a newline before an `<a>` or a `<b>` is a space in HTML, and the
     * compressor removed it.
     *
     * Measured before turning it off: 8.1 MB of HTML becomes 8.3 MB, and gzipped
     * the two are the same 1.8 MB — which is what actually crosses the wire. The
     * alternative was asking every future author to remember never to break a
     * line before an inline tag, for no measurable gain.
     */
    compressHTML: false,
  // Astro 7 deprecated `markdown.remarkPlugins` / `rehypePlugins` / `remarkRehype` in
  // favour of naming the processor: the pipeline is now an object you build, not a set of
  // loose keys Astro assembles. Warned only at build time, not by `astro check`.
  markdown: {
    processor: unified({ rehypePlugins: [rehypeExternalLinksInOwnTab, rehypeAparteAsides] }),
    // Code blocks come out as the code segment's own markup (src/lib/markdown.mjs), coloured at
    // build time for both themes: `defaultColor: false` writes `--shiki-light`/`--shiki-dark`
    // on every token and the site's CSS picks one per theme.
    shikiConfig: {
      // Measured on the site's code grounds (axe, 2026-10-16): github-light's red, green and grey and
      // github-dark's comment grey fell under 4.5:1; these two keep every token colour above it.
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-default' },
      defaultColor: false,
      transformers: [aparteCodeBlock()],
    },
  },
  // The canonical site URL — enables the sitemap + correct canonical/OG links.
  // Change this one string if the docs move to another domain.
  site: 'https://apartejs.dev',
  // Moved pages are NOT Astro `redirects`: those emit a meta refresh to a fixed URL and drop
  // the `#anchor` published links carry. Each old address gets its own page instead —
  // src/data/redirects.mjs (the map) and src/pages/[...moved].astro (the page).
  integrations: [
    /*
     * Ours rather than Starlight's: Starlight adds `@astrojs/sitemap` itself unless
     * the integration is already in this array, and its copy takes no filter.
     *
     * What the filter removes: the frame routes, one per element and per kit family,
     * and the pages that moved. Each frame is the document of an <iframe> — it carries
     * `<meta name="robots" content="noindex, nofollow">` on purpose, because it
     * would otherwise compete in search with the real page that frames it and say
     * far less. A moved page is `noindex` too. Listing a noindex URL in a sitemap is a
     * contradiction a crawler reports back: 227 URLs were submitted, 59 of them asking
     * not to be indexed.
     */
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !PREVIEW_FRAME.test(path) && !CHANGELOG_COMPARE.test(path) && !(path in REDIRECTS);
      },
    }),
    starlight({
      routeMiddleware: './src/routeData.ts',
      title: 'aparté',
      // Code blocks are drawn by the library's own code-segment markup (see `markdown` above),
      // not by Expressive Code; no page used its options (titles, highlighted lines).
      expressiveCode: false,
      description: 'Framework-agnostic AI-chat library — vanilla web components, zero third-party dependencies.',
      // The mascot: `( '.' )` — the wordmark's brass parentheses, with a face.
      // SVG for browsers; the raster set below is for search engines and older
      // clients (both generated from the SVG by scripts/gen-favicon.mjs).
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48 32x32 16x16' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' } },
      ],
      // ONE sidebar, in collapsible groups — Starlight's own. It used to be four sidebars
      // switched from a picker at the top (`starlight-sidebar-topics`): the reader saw a
      // quarter of the site at a time and had to know which quarter held the page, and
      // the maintainer named it as the thing that made the docs hard to read. The order
      // inside each group still comes from each page's `sidebar.order` frontmatter. Groups a
      // first visit does not need open start collapsed; Starlight opens whichever holds the
      // current page.
      sidebar: [
        // The Docs section, by what a reader came to do. Each guide names its own group
        // (scripts/lib/guides.mjs); the framework and provider pages are listed by folder.
        // The look comes right after the start, and the models last but for help.
        { label: 'Start here', items: guides.start },
        { label: 'Look and content', items: guides.look },
        { label: 'Frameworks', collapsed: true, items: [{ autogenerate: { directory: 'frameworks' } }] },
        { label: 'Conversations', items: guides.conversations },
        { label: 'Agents and tools', items: guides.agents },
        {
          label: 'Models and agents',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/providers/' },
            { label: 'Models', items: [{ autogenerate: { directory: 'providers/ai' } }] },
            { label: 'Agent frameworks', items: [{ autogenerate: { directory: 'providers/agent' } }] },
            ...guides.models,
          ],
        },
        // Packages built on aparté that live in their own repositories, on their own versions,
        // pinned to exact aparté versions — the library's own consumers, listed for their users.
        { label: 'Other plugins', collapsed: true, items: [{ autogenerate: { directory: 'other-plugins' } }] },
        { label: 'Help', items: guides.help },
        // The catalogue, by what a reader sees: Chat, Cards, Layout, Kit, one page per thing, read
        // from each page's own `catalog` block (scripts/lib/catalogue.mjs). Every element,
        // segment type and kit family now has its page there.
        ...catalogueSidebar(),
        // The generated indexes, by kind: every element, every segment type, every kit family,
        // each linking to its catalogue page.
        {
          label: 'Indexes',
          collapsed: true,
          items: [
            { label: 'Elements', link: '/components/elements/' },
            { label: 'Segments', link: '/segments/' },
            { label: 'UI kit', link: '/kit/' },
          ],
        },
        { label: 'Reference', collapsed: true, items: [{ autogenerate: { directory: 'reference' } }] },
        {
          label: 'Changelog',
          collapsed: true,
          // `latest` first, because the group's first link must be a RELEASE and not the
          // list: the list renders every version's full body, so landing there is the
          // 3087-line page again under a new URL. `recent` is set past the version count
          // so the group carries them all — the sidebar and the page then agree.
          items: makeChangelogsSidebarLinks([
            { type: 'latest', base: 'changelog', label: 'Latest release' },
            { type: 'all', base: 'changelog', label: 'All versions' },
            { type: 'recent', base: 'changelog', count: 50 },
          ]),
        },
        // The two pages that argue for the library rather than teach it. The header links
        // them on a wide screen; the group keeps them in the phone's menu, where the
        // header's links are hidden.
        {
          label: 'About aparté',
          collapsed: true,
          items: [
            { label: 'Why aparté', link: '/why/' },
            // The page the category's intent queries land on ("X alternative"): named,
            // fair, and the one place the runtime/catalogue split is said in full.
            { label: 'Compare', link: '/compare/' },
          ],
        },
      ],
      // Renders the release notes as a paginated version LIST at /changelog/ plus one
      // page per version at /changelog/version/<v>/. The 14 versions used to be one
      // 3087-line page — 26% of the whole docs corpus, with two releases alone (0.10.0
      // and 0.8.0) accounting for 46% of it. The input is the root CHANGELOG.md that
      // `pnpm version-packages` already generates, so nothing new has to be maintained.
      plugins: [
        starlightChangelogs(),
        // Fails the BUILD on a broken internal link, where scripts/check-doc-links.mjs
        // runs after it. It also checks things ours does not: relative-link policy,
        // locale consistency, localhost URLs, links inside custom components.
        //
        // Our script stays, for the one question no option here covers: whether every
        // built page is LINKED TO by something. That is the failure this repo keeps
        // finding — a capability that ships documented and unreachable — and the pass
        // needs the same crawl the link check already does, so it is not separable into
        // something smaller. The overlap on link resolution is the price.
        starlightLinksValidator({
          // The changelog's routes are built by `starlight-changelogs`, which this plugin
          // knows nothing about — so every one of them reads as a broken link and NO page
          // could link to the changelog at all. That is not a hypothetical: the first page
          // that tried (`why.md`, pointing a reader at the version history) failed the
          // build. Excluded by prefix rather than one link at a time, since the whole
          // subtree has the same cause.
          // Same family: /models/ and its children are Astro pages on the landing's frame,
          // outside Starlight's collection, and the plugin reports a link to one as
          // "invalid link to custom page" although the route is built. `check:doc-links`
          // walks the BUILT pages, so a link into /models/ is still verified, by that guard.
          exclude: ['/changelog/**', '/models/**', '/roadmap/', '/templates/', '/templates/**'],
        }),
        // Replaces apps/docs/scripts/gen-llms-txt.mjs. llmstxt.org is an external spec
        // that will keep moving, and tracking a spec is the thing to delegate rather
        // than reimplement. It also emits an llms-small.txt we never had.
        //
        // `description` carries over the paragraph the old script hand-wrote: Starlight's
        // own `description` is one line for a meta tag, and an LLM reading the site cold
        // needs the architecture stated, not the tagline.
        //
        // What a model reading the site cold could NOT find (2026-08-28, two consumers): the
        // approval elicitation (a real consumer rebuilt a modal it already had), the UI kit
        // of classes, `systemPrompt: false`. `llms.txt` was a 13-line index naming no page,
        // and `llms-small.txt` weighed 700 KB because it carried the generated references
        // (471 CSS variables, every class, every event). So: one set per question a model
        // asks, each a separate file with a sentence in the index; the generated bulk and
        // the changelog out of the small file; and `details` says where the three families
        // live, which no single page does.
        starlightLlmsTxt({
          description:
            'aparté is a framework-agnostic AI-chat library: vanilla web components with zero '
            + 'third-party dependencies (@aparte/core, whose only dependency is @aparte/engine, the '
            + 'agent loop), plus thin React, Vue, Svelte and Angular '
            + 'wrappers. It is backend-agnostic — a transport sends requests either browser-direct '
            + '(bring your own key, or a local model) or to your own endpoint, where the key stays '
            + 'server-side. Providers and plugins are opt-in packages. How it compares to '
            + 'assistant-ui, AI Elements, deep-chat and Loquix: /compare/.',
          details: [
            'Three families, three places. **Components** are custom elements (`<aparte-chat>`, '
            + '`<aparte-composer>`, `<aparte-select>`…) under /components/. **Segments** are the '
            + 'data a message bubble renders (text, thinking, code, tool_call, error, '
            + 'custom) under /segments/ — an artifact is a plugin\'s segment (/components/artifact/). '
            + '**The UI kit** is plain CSS classes on plain elements '
            + '(`aparte-btn`, `aparte-field`, `aparte-alert`, `aparte-tag`, `aparte-menu`, tabs, '
            + 'switches, avatars) for the controls a host puts around the chat, listed with their '
            + 'HTML at /kit/ (one page per family, live) and /reference/classes/ (every class) — they exist, they are themed by the same variables as '
            + 'the chat, do not rewrite your own.',
            'Asking the user something mid-run is built in: a tool marked `needsApproval` pauses '
            + 'for a human decision (guide: /guides/tools/#require-approval-human-in-the-loop), '
            + '`requestUserInput()` asks a typed question or a yes/no decision '
            + '(`kind: \'approval\'`) through a panel in the composer (/guides/elicitation/), and '
            + '`@aparte/plugin-ask-user` gives the model a ready-made `ask_user` tool '
            + '(/components/question/, with `systemPrompt: false` to send no system message). '
            + 'Approval MODES — plan / ask / auto-edit / auto, from a read/write/exec '
            + 'classification of your tool names, with an `<aparte-approval-mode>` switch for the '
            + 'composer toolbar — are `@aparte/plugin-approval` (/components/approval-mode/), built on '
            + 'core\'s per-call `setApprovalPolicy()`.',
            'A reply draws more than Markdown: maths through `@aparte/plugin-katex` (/guides/math/) '
            + 'and Mermaid diagrams through `@aparte/plugin-mermaid` (/guides/diagrams/), both while '
            + 'they stream, under any Markdown provider; and the sources it cites, as a chip after '
            + 'each cited passage, a card and a list (/guides/citations/), from a provider\'s '
            + '`sources` stream event or two fields on a text segment. Charts come from '
            + '`@aparte/plugin-echarts` or `@aparte/plugin-chartjs` (/guides/charts/), from a fenced '
            + 'block or a tool\'s result.',
            'A tool\'s result can be drawn as a rich card with `@aparte/plugin-cards` (/guides/cards/): '
            + 'weather, items, products, places, key figures, orders, market quotes, an agent\'s plan, '
            + 'matches, media and link previews, one entry per card, each reading the tool\'s own '
            + 'fields through `map`. `onChange` makes a card answer its own controls (the stock '
            + 'card\'s range buttons), redrawn in place; `defineCard` builds a card of your own.',
            'Running the agent loop on your own server, next to your tools, is built in: '
            + '`createAparteAgentHandler` on the server and `createAgentStreamRunner` in the page, '
            + 'with tool approvals that cross the network and survive a reload, and browser tools '
            + 'that still run in the page (/guides/server-loop/). '
            + 'An agent served over AG-UI (Agno, LangGraph, Mastra, CrewAI, Pydantic AI) or a '
            + 'TanStack AI chat route plugs in as `createAgUiRunner` from `@aparte/runner-ag-ui` '
            + '(/providers/agent/ag-ui/, /providers/agent/tanstack-ai/). '
            + 'An n8n chat workflow (a Chat Trigger and its AI Agent) plugs in as `createN8nRunner` '
            + 'from `@aparte/runner-n8n` (/providers/agent/n8n/), inside any aparté chat or `<aparte-launcher>`. '
            + 'Driving a loop you own instead (a backend that streams over its own SSE, another '
            + 'agent framework): the display-only API — `appendMessage`, `addSegment`, `appendToSegment`, '
            + '`updateSegment`, then `updateMessage(id, { status: \'completed\' })` to finish the '
            + 'turn — is documented at /guides/bring-your-own-loop/. Plain `content` and '
            + '`segments` are mutually exclusive on a message.',
          ].join('\n\n'),
          customSets: LLMS_SETS,
          // The generated references are exhaustive by construction (471 variables, every
          // class, every event) and the changelog is history: neither belongs in the file a
          // small context window is meant to swallow whole.
          // The element pages too: twelve generated attribute/event/CSS tables, all in
          // the "Reference" set and in the full file. Measured: the small file went from
          // 700 KB to 582 KB without them, and the guides are what a small window needs.
          exclude: ['reference/css-variables', 'reference/classes', 'reference/events', 'reference/icons', 'components/**', 'changelog/**'],
          // What a model reading the text gains nothing from: the copy button and language
          // label of a code block (the language is on the fence), and the width bar of a live
          // preview ("Width 375 768 Full" was printed 85 times in llms-full.txt).
          customSelectors: { all: ['.aparte-code-header', '.aparte-preview-bar'] },
          optionalLinks: [
            { label: 'Source and issues', url: 'https://github.com/apartejs/aparte', description: 'The monorepo — open an issue here.' },
            { label: 'npm', url: 'https://www.npmjs.com/package/@aparte/core', description: 'Every @aparte/* package ships at one version.' },
          ],
        }),
      ],
      // Adds the `og:image` Starlight's own `twitter:card: summary_large_image`
      // already asks for and never provided (see the component for why an override
      // rather than a `head` entry).
      // SocialIcons: the site's sections as links beside the search, the way UI libraries
      // present themselves (the slot sits in the header AND the phone's menu). PageTitle:
      // the page's own description under its title, the one sentence a reader needs
      // before the first heading.
      // Starlight is the engine; what a reader sees is drawn with the library. The frame,
      // header, outline and pager below are the site's own (src/components/site/), so the
      // same header and footer also serve the pages Starlight does not build.
      components: {
        Head: './src/components/Head.astro',
        Header: './src/components/overrides/Header.astro',
        PageFrame: './src/components/overrides/PageFrame.astro',
        TwoColumnContent: './src/components/overrides/TwoColumnContent.astro',
        PageSidebar: './src/components/overrides/PageSidebar.astro',
        PageTitle: './src/components/PageTitle.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      customCss: [
        '@fontsource-variable/geist',
        '@fontsource-variable/geist-mono',
        // The library's stylesheet on every page, in its own cascade layer: the site is
        // drawn with its recipes. See the file for why the layer.
        './src/styles/library.css',
        './src/styles/palette.css',
        './src/styles/aparte-theme.css',
        './src/styles/code.css',
        './src/styles/site-frame.css',
        './src/styles/content.css',
      ],
    }),
  ],
  // Dev only: resolve @aparte/core (and its /styles.css) to TS/CSS source instead of
  // the built dist, so editing packages/core/src hot-reloads in the docs with NO
  // rebuild and NO server restart. Mirrors tsconfig.base.json's customConditions, so
  // Vite and the TS/IDE resolver agree. Only @aparte/core defines this export condition
  // — every other dependency resolves normally. SSR is left untouched: its condition set
  // has no `@aparte-workspace/source`, so it keeps resolving the Node-safe build via the
  // `node` condition (the browser entry touches HTMLElement). Production build (npm
  // lifecycle != "dev") omits this entirely and consumes the published dist as before.
  ...(isDev
    ? {
        vite: {
          resolve: {
            conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
          },
        },
      }
    : {}),
});
