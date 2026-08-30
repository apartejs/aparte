---
title: Reference
description: The generated references — the UI kit's classes, every CSS variable, the events, the config, the engine, the wrappers and the icons — and what each one answers.
sidebar:
  order: 0
---

Seven pages generated from the source at build time — so what they list is what the
version you installed ships — and one declared by hand and measured against it. Each
answers one question:

| Page | The question it answers |
| --- | --- |
| [The UI kit — classes](/reference/classes/) | *Which ready-made classes can I put on my own elements?* Every class on one page. Buttons, fields, switches, tags, alerts, menus, tabs, avatars — plain classes on plain elements, themed by the same variables as the chat, with their HTML verbatim. To *see* them first, one family per page, start at the [UI kit](/kit/button/). |
| [CSS variables](/reference/css-variables/) | *Which `--aparte-*` token do I set to change this?* Every declared variable with its default, and the ones a component reads with a fallback. |
| [Events](/reference/events/) | *What does aparté dispatch, with what `detail`?* The kebab-case event map, one row per event. |
| [Config](/reference/config/) | *What can `aparteGlobalConfig` (or a per-chat `AparteConfig`) be told?* Providers, transports, renderers, hooks, host handlers. |
| [Engine](/reference/engine/) | *What does `@aparte/engine` export?* The loop and its run events. |
| [Wrappers](/reference/wrappers/) | *What is the same on React, Vue, Svelte and Angular?* The one imperative contract and how each framework spells it. |
| [Icons](/reference/icons/) | *Which glyphs exist, and how do I swap them?* The built-in set and the extended set behind `@aparte/core/icons`. |
| [Support matrix](/reference/support/) | *Does it run where my users are?* The browser, Node, framework, bundler and TypeScript floors — each derived from what the code uses — beside the versions CI runs. |

:::note[Reading the repository instead of this site?]
Seven of the eight pages above do not exist as files in the repository: they are written
at build time from the source, which is what makes them impossible to leave stale. If you
are working from a checkout — offline, a vendored copy, an agent with a clone — the source
each one is generated FROM is the thing to read:

| Page | Where it is generated from |
| --- | --- |
| CSS variables | the `--aparte-*` declarations in `packages/core/src/styles/` (`theme.css` holds the tokens) |
| Classes / UI kit | the class names and banner comments in the same sheets |
| Events | `packages/core/src/types/event-map.ts` and the `@fires` tags on each element |
| Config | `packages/core/src/config/` |
| Engine | `packages/engine/src/` |
| Wrappers | the four `packages/wrappers/*/src/` |
| Icons | `packages/core/src/icons/` |

`llms.txt` and `llms-full.txt` at the site root carry the built pages in one file, if what
you want is the rendered text rather than the source.
:::

:::tip[Looking for the components themselves?]
The custom elements — `<aparte-chat>`, `<aparte-composer>`, `<aparte-select>`… — are under
[Components](/components/); the data a bubble renders is under [Segments](/segments/text/).
The **UI kit** above is the third family: no tag, just classes, for the controls your own
page puts around the chat.
:::
