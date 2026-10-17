/**
 * The topic files of `/llms.txt`, one per set: starlight-llms-txt builds each at
 * `/_llms-txt/<slug>.txt`, the slug being the label through github-slugger. Read by
 * astro.config.mjs (`customSets`) and by the page that lists them (guides/docs-for-agents),
 * so the page cannot name a set the build does not make. `@aparte/docs-mcp` reads these labels.
 */
export const LLMS_SETS = [
  {
    label: 'Getting started, frameworks and guides',
    description: 'Install, first render in vanilla or a framework, and every guide (theming, tools, persistence, branching, localisation, accessibility, troubleshooting).',
    paths: ['guides/**', 'frameworks/**', 'why', 'compare'],
  },
  {
    label: 'Tools, approval and asking the user',
    description: 'Registering tools, the tool-call row, human-in-the-loop approval, typed questions to the user (elicitation), and the ask-user plugin.',
    paths: ['guides/tools', 'guides/elicitation', 'components/tool', 'components/approval', 'components/approval-mode', 'components/question', 'components/artifact'],
  },
  {
    label: 'Run the agent loop on your server',
    description: 'createAparteAgentHandler on the server and createAgentStreamRunner in the page: tools run next to your server, approvals cross the network and survive a reload, browser tools still run in the page.',
    paths: ['guides/server-loop'],
  },
  {
    label: 'Bring your own loop (display-only)',
    description: 'Driving the transcript from a loop you own: appendMessage, segments, token streams, finishing a turn, the wrappers\' imperative API, the backend transport.',
    paths: ['guides/bring-your-own-loop', 'guides/backend-transport', 'guides/engine', 'reference/wrappers', 'reference/engine'],
  },
  {
    label: 'Theming and the UI kit',
    description: 'CSS variables, dark mode, the customization hooks, and the kit of plain classes (buttons, fields, alerts, tags, menus, tabs) with their HTML.',
    paths: ['guides/theming', 'guides/markdown', 'guides/layout', 'guides/customization', 'guides/customization/**', 'kit/**', 'reference/classes', 'reference/css-variables'],
  },
  {
    label: 'Providers and transports',
    description: 'OpenAI-compatible endpoints, the AI SDK bridge, a model in the browser, the scripted scenario provider, local models, writing your own provider.',
    paths: ['providers/**', 'guides/local-models'],
  },
  {
    label: 'Reference: components, segments, events, config',
    description: 'Every custom element with its attributes, events and CSS properties; every segment shape; the event map; the config object; the icons.',
    paths: ['components/**', 'segments/**', 'reference/events', 'reference/core/**', 'reference/icons', 'reference/support', 'reference/stability', 'reference'],
  },
];

/** Where a set's file is built: github-slugger's rule on its label, which the plugin uses. */
export const llmsSetPath = (label) =>
    `/_llms-txt/${label.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/ /g, '-')}.txt`;
