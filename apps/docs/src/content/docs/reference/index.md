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
| [The UI kit — classes](/reference/classes/) | *Which ready-made classes can I put on my own elements?* Buttons, fields, switches, tags, alerts, menus, tabs, avatars — plain classes on plain elements, themed by the same variables as the chat, with their HTML verbatim. |
| [CSS variables](/reference/css-variables/) | *Which `--aparte-*` token do I set to change this?* Every declared variable with its default, and the ones a component reads with a fallback. |
| [Events](/reference/events/) | *What does aparté dispatch, with what `detail`?* The kebab-case event map, one row per event. |
| [Config](/reference/config/) | *What can `aparteGlobalConfig` (or a per-chat `AparteConfig`) be told?* Providers, transports, renderers, hooks, host handlers. |
| [Engine](/reference/engine/) | *What does `@aparte/engine` export?* The loop, its run events, the compaction selector. |
| [Wrappers](/reference/wrappers/) | *What is the same on React, Vue, Svelte and Angular?* The one imperative contract and how each framework spells it. |
| [Icons](/reference/icons/) | *Which glyphs exist, and how do I swap them?* The built-in set and the extended set behind `@aparte/core/icons`. |
| [Support matrix](/reference/support/) | *Does it run where my users are?* The browser, Node, framework, bundler and TypeScript floors — each derived from what the code uses — beside the versions CI runs. |

:::tip[Looking for the components themselves?]
The custom elements — `<aparte-chat>`, `<aparte-composer>`, `<aparte-select>`… — are under
[Components](/components/); the data a bubble renders is under [Segments](/segments/text/).
The **UI kit** above is the third family: no tag, just classes, for the controls your own
page puts around the chat.
:::
