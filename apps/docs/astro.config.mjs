import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import starlightChangelogs, { makeChangelogsSidebarLinks } from 'starlight-changelogs';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';

// Dev only: read @aparte/core from source (see the `vite` block below). Production
// builds keep consuming the published `dist`, so deploys are unchanged.
const isDev = process.env.npm_lifecycle_event === 'dev';

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
  markdown: { processor: unified({ rehypePlugins: [rehypeExternalLinksInOwnTab] }) },
  // The canonical site URL — enables the sitemap + correct canonical/OG links.
  // Change this one string if the docs move to another domain.
  site: 'https://apartejs.dev',
  // /changelog is the guessable URL; the first release of this page used
  // /reference/release-notes/, which is already in the sitemap. Keep it alive.
  // Both are URLs that shipped and are in the sitemap. /reference/api was one 752-line
  // page listing every element; it is now one page per element under /components/, so the
  // old URL points at the catalogue rather than 404ing on a reader's bookmark.
  redirects: {
    '/reference/release-notes': '/changelog/',
    '/reference/api': '/components/',
  },
  integrations: [
    starlight({
      title: 'aparté',
      description: 'Framework-agnostic AI-chat library — vanilla web components, zero third-party dependencies.',
      // The mascot: `( '.' )` — the wordmark's brass parentheses, with a face.
      // SVG for browsers; the raster set below is for search engines and older
      // clients (both generated from the SVG by scripts/gen-favicon.mjs).
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48 32x32 16x16' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' } },
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
          exclude: ['/changelog/**'],
        }),
        // FOUR sidebars rather than one, switched from a picker at the top: after the
        // catalogue lands this list is ~61 entries, and the complaint that started this lot
        // was volume in a flat list. Topics group pages BY THEIR EXISTING PATHS, so no URL
        // moved and nothing had to be rewritten.
        //
        // The order inside each group still comes from each page's `sidebar.order`
        // frontmatter, which is what keeps theming second in Guides.
        starlightSidebarTopics([
          {
            label: 'Learn',
            link: '/why/',
            items: [
              { label: 'Why aparté', link: '/why/' },
              // The page the category's intent queries land on ("X alternative"): named,
              // fair, and the one place the runtime/catalogue split is said in full.
              { label: 'Compare', link: '/compare/' },
              { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
            ],
          },
          {
            // The catalogue. Three families because the source tree draws them: generic
            // primitives, the chat surface, and segments — which are data with no tag, so a
            // different page shape entirely. Every page here is GENERATED from the manifest
            // and from the segment union, so shipping an element ships its page.
            label: 'Components',
            link: '/components/',
            items: [
              { label: 'Overview', link: '/components/' },
              // One autogenerate over `components/`, whose subdirectories ARE the groups —
              // conversation, input, utility. Grouped by what a reader is looking for, which is
              // what all six surveyed sites do; "primitives vs components" was our source tree.
              { autogenerate: { directory: 'components' } },
              { label: 'Segments', items: [{ autogenerate: { directory: 'segments' } }] },
            ],
          },
          {
            label: 'Integrations',
            link: '/frameworks/',
            items: [
              { label: 'Frameworks', items: [{ autogenerate: { directory: 'frameworks' } }] },
              {
                label: 'Providers',
                items: [
                  { label: 'Overview', link: '/providers/' },
                  { label: 'AI', items: [{ autogenerate: { directory: 'providers/ai' } }] },
                ],
              },
              { label: 'Plugins', items: [{ autogenerate: { directory: 'plugins' } }] },
            ],
          },
          {
            label: 'Reference',
            // Not /reference/api/: that page is now one page per element under /components/,
            // and a topic whose landing URL redirects into ANOTHER topic is a navigation bug a
            // link checker cannot see, since the redirect makes the URL resolve.
            link: '/reference/config/',
            items: [{ autogenerate: { directory: 'reference' } }],
          },
          // Still its own topic, for the reason recorded when it was moved OUT of Reference:
          // it lived there for a few hours and nobody found it. A topic is as top-level as a
          // sidebar entry was, and the version list becomes its sidebar instead of one link.
          {
            id: 'changelog',
            label: 'Changelog',
            link: '/changelog/',
            // `latest` first, because the topic's landing page must be a RELEASE and not the
            // list: the list renders every version's full body, so landing there is the
            // 3087-line page again under a new URL. `recent` is set past the version count so
            // the sidebar carries them all — the left column and the page then agree, which
            // they did not when it showed five against fourteen.
            items: makeChangelogsSidebarLinks([
              { type: 'latest', base: 'changelog', label: 'Latest release' },
              { type: 'all', base: 'changelog', label: 'All versions' },
              { type: 'recent', base: 'changelog', count: 50 },
            ]),
          },
        ], {
          // The changelog's version pages are generated by starlight-changelogs, which knows
          // nothing about topics, so they appear in no `items` array and the plugin cannot
          // place them. This is the option documented for exactly that case.
          topics: { changelog: ['/changelog/**'] },
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
            + 'server-side. Providers and plugins are opt-in packages.',
          details: [
            'Three families, three places. **Components** are custom elements (`<aparte-chat>`, '
            + '`<aparte-composer>`, `<aparte-select>`…) under /components/. **Segments** are the '
            + 'data a message bubble renders (text, thinking, code, tool_call, error, artifact, '
            + 'custom) under /segments/. **The UI kit** is plain CSS classes on plain elements '
            + '(`aparte-btn`, `aparte-field`, `aparte-alert`, `aparte-tag`, `aparte-menu`, tabs, '
            + 'switches, avatars) for the controls a host puts around the chat, listed with their '
            + 'HTML at /reference/classes/ — they exist, they are themed by the same variables as '
            + 'the chat, do not rewrite your own.',
            'Asking the user something mid-run is built in: a tool marked `needsApproval` pauses '
            + 'for a human decision (guide: /guides/tools/#require-approval-human-in-the-loop), '
            + '`requestUserInput()` asks a typed question or a yes/no decision '
            + '(`kind: \'approval\'`) through a panel in the composer (/guides/elicitation/), and '
            + '`@aparte/plugin-ask-user` gives the model a ready-made `ask_user` tool '
            + '(/plugins/ask-user/, with `systemPrompt: false` to send no system message). '
            + 'Approval MODES — plan / ask / auto-edit / auto, from a read/write/exec '
            + 'classification of your tool names, with an `<aparte-approval-mode>` switch for the '
            + 'composer toolbar — are `@aparte/plugin-approval` (/plugins/approval/), built on '
            + 'core\'s per-call `setApprovalPolicy()`.',
            'Driving your own loop (a backend that streams over its own SSE, a server-side '
            + 'agent): the display-only API — `appendMessage`, `addSegment`, `appendToSegment`, '
            + '`updateSegment`, then `updateMessage(id, { status: \'completed\' })` to finish the '
            + 'turn — is documented at /guides/bring-your-own-loop/. Plain `content` and '
            + '`segments` are mutually exclusive on a message.',
          ].join('\n\n'),
          customSets: [
            {
              label: 'Getting started, frameworks and guides',
              description: 'Install, first render in vanilla or a framework, and every guide (theming, tools, persistence, branching, localisation, accessibility, troubleshooting).',
              paths: ['guides/**', 'frameworks/**', 'why', 'compare'],
            },
            {
              label: 'Tools, approval and asking the user',
              description: 'Registering tools, the tool-call row, human-in-the-loop approval, typed questions to the user (elicitation), and the ask-user plugin.',
              paths: ['guides/tools', 'guides/tool-call-ui', 'guides/elicitation', 'plugins/ask-user', 'plugins/approval', 'plugins/artifacts', 'segments/tool-call'],
            },
            {
              label: 'Bring your own loop (display-only)',
              description: 'Driving the transcript from a loop you own: appendMessage, segments, token streams, finishing a turn, the wrappers\' imperative API, the backend transport.',
              paths: ['guides/bring-your-own-loop', 'guides/backend-transport', 'guides/engine', 'reference/wrappers', 'reference/engine'],
            },
            {
              label: 'Theming and the UI kit',
              description: 'CSS variables, dark mode, the customization hooks, and the kit of plain classes (buttons, fields, alerts, tags, menus, tabs) with their HTML.',
              paths: ['guides/theming', 'guides/layout', 'guides/customization', 'reference/classes', 'reference/css-variables'],
            },
            {
              label: 'Providers and transports',
              description: 'OpenAI-compatible endpoints, the AI SDK bridge, a model in the browser, the scripted scenario provider, local models, writing your own provider.',
              paths: ['providers/**', 'guides/local-models'],
            },
            {
              label: 'Reference: components, segments, events, config',
              description: 'Every custom element with its attributes, events and CSS properties; every segment shape; the event map; the config object; the icons.',
              paths: ['components/**', 'segments/**', 'reference/events', 'reference/config', 'reference/icons', 'reference/support', 'reference'],
            },
          ],
          // The generated references are exhaustive by construction (471 variables, every
          // class, every event) and the changelog is history: neither belongs in the file a
          // small context window is meant to swallow whole.
          // The element pages too: twelve generated attribute/event/CSS tables, all in
          // the "Reference" set and in the full file. Measured: the small file went from
          // 700 KB to 582 KB without them, and the guides are what a small window needs.
          exclude: ['reference/css-variables', 'reference/classes', 'reference/events', 'reference/icons', 'components/**', 'changelog/**'],
          optionalLinks: [
            { label: 'Source and issues', url: 'https://github.com/apartejs/aparte', description: 'The monorepo — open an issue here.' },
            { label: 'npm', url: 'https://www.npmjs.com/package/@aparte/core', description: 'Every @aparte/* package ships at one version.' },
          ],
        }),
      ],
      // Adds the `og:image` Starlight's own `twitter:card: summary_large_image`
      // already asks for and never provided (see the component for why an override
      // rather than a `head` entry).
      components: { Head: './src/components/Head.astro' },
      customCss: ['./src/styles/palette.css', './src/styles/aparte-theme.css'],
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
