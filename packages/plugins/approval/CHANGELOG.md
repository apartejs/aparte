# @aparte/plugin-approval

## 0.28.0

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

## 0.26.0

## 0.25.0

### Patch Changes

- 6fed78c: `<aparte-approval-mode>` and `<aparte-model-selector>` now wait for a server-rendered chat to hydrate before they draw.

  Placed in the toolbar of a server-rendered `<AparteChat>`, either tag drew itself as soon as its plugin was imported — before the framework had hydrated the page — so React found children it had not rendered and threw the server's HTML away (error 418). Both now honour `defer-hydration`, like core's own elements, and draw when the wrapper releases the chat. `<aparte-ask-user>` already did, through the `<aparte-elicitation>` it extends. An element of your own that draws itself on connect can do the same: call `deferHydrationOf(YourElement)` before `customElements.define`.

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

### Patch Changes

- 2d32326: `<aparte-approval-mode>` no longer warns "found no approval setup" when you follow the documented order: the tag in the page, then `setupApproval()` in the script that imports the plugin.

  Importing the plugin defines the element, so a tag already in the page bound before the `setupApproval()` call on the next line and warned about a setup that was about to arrive. The check now waits for that script to finish; with no setup at all, it still warns once.

- ff458c1: Importing `@aparte/core` (or the approval, artifacts, ask-user or model-selector plugin) from a Cloudflare Worker, a Vercel edge route or a Web Worker that webpack compiles with `target: 'webworker'` now resolves the DOM-free entry instead of the browser one, which failed at import on its first `extends HTMLElement`.

  The DOM-free entry was reachable through the `node` condition only, and those bundlers resolve `workerd`, `edge-light` or `worker` alongside `browser` and `import`. The exports maps now list `worker`, `workerd`, `edge-light`, `deno` and `bun` next to `node`, pointing at the same entry; a browser still gets the elements. A worker started inside a page build is not covered — `new Worker(new URL('./w.js', import.meta.url))` under Vite, or under webpack with its default `target: 'web'`: both resolve it with the browser's conditions, so it gets the browser entry. For core, import the new `@aparte/core/headless` there; the plugins have no such subpath, and how to run a provider or a plugin's tool in that worker is on the [Elements page](https://apartejs.dev/frameworks/elements/#on-the-server). `check:node-import` walks each published map with the conditions of webpack's worker target, wrangler and a Vercel edge route.

## 0.19.3

## 0.19.2

## 0.19.1

## 0.19.0

## 0.18.0

## 0.17.3

## 0.17.2

## 0.17.1

## 0.17.0

## 0.16.11

### Patch Changes

- 21dd3bc: The four plugins that ship a custom element now carry the `web-components` npm keyword; nothing changes in the code you import.

  Each already pointed `customElements` at its manifest, which is what the webcomponents.org catalogue reads, but only core carried the keyword the catalogue and npm search filter on. The five plugins that expose no element (compaction, marked, shiki, streaming-markdown, titler) are untouched: they have nothing to list there.

## 0.16.10

## 0.16.9

## 0.16.8

## 0.16.7

### Patch Changes

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

## 0.16.6

## 0.16.5

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Minor Changes

- 4123389: The `node` entry exports the `AparteApprovalMode` element type, so an SSR consumer on `node16`/`nodenext` can name it in a signature.

  `export type` is erased at compile time, so the entry stays DOM-free — `scripts/check-node-import.mjs` asserts it keeps importing without a document. The element itself is deliberately absent from that entry: it needs a `document`, and `import '@aparte/plugin-approval'` on a server registers the policy and nothing else.

- a91ac86: New package: `@aparte/plugin-approval` — approval modes for tool calls. `setupApproval({ classify: { read, write, exec }, mode })` installs a per-call policy from a classification of your tool names; the modes are `plan` (read-only tools run, the rest is refused with a reason the model reads), `ask` (every write or execution asks at the composer), `auto-edit` (writes run, executions ask) and `auto` (never asks). `<aparte-approval-mode>` is the switch, for `<aparte-composer-toolbar>`; `approval.setMode()` / `subscribe()` are the same switch from code. It executes nothing and stores nothing.

  The names are yours because they are wire format: no library can know that `run_command` executes and `search_docs` reads. A tool in no list keeps its own `needsApproval` (and runs under `auto`). Built on core's new `setApprovalPolicy()`.

- b6f4cc9: `setupAskUser` and `setupApproval` now take their options first and the config last, like every other `setup*` — `setupAskUser({ maxOptions: 6 })`, `setupApproval({ classify })`, and `setupAskUser({}, config)` for a scoped chat. `setupAskUser(config, options)` and `setupApproval(config, options)` no longer compile.

  The plugins overview stated the rule ("every `setup*` takes the config instance as its last argument, defaulting to the global") and these two broke it; the leading `undefined` the ask-user page had to write to reach the options was the symptom. Pre-1.0, a rename is a rename.
