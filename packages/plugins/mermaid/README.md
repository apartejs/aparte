# @aparte/plugin-mermaid

Diagrams for [aparté](https://github.com/apartejs/aparte) via [Mermaid](https://mermaid.js.org).
Every ```` ```mermaid ```` fence in a reply is drawn as a diagram — as it streams, whichever
Markdown provider is installed, or none.

```bash
npm install @aparte/plugin-mermaid @aparte/core mermaid
```

```ts
import { setupMermaid } from '@aparte/plugin-mermaid';

setupMermaid();
```

`@aparte/core` and `mermaid` (11.16.1 or later) are **peer dependencies**. Mermaid is loaded on
the first diagram, not before, and a diagram is drawn only once it comes near the screen, so
reopening a long conversation stays fast.

## An image, so nothing in it reaches the page

Each diagram is an `<img>` of its SVG. A browser draws an image's SVG with no scripts and no
access to the page, so neither a label a model wrote nor a style inside the diagram can act on
the chat around it. Mermaid also runs with `securityLevel: 'strict'` and HTML labels off, and a
diagram's own `%%{init}%%` cannot turn either back on.

What that costs: the text in a diagram cannot be selected, and it is set in the system fonts,
since an image cannot load the page's. A drawn diagram wears no code card: no header, no copy button.

## While a reply streams

The diagram is redrawn as its fence arrives — at most every 300 ms, or as long as the last
drawing took — and keeps the last version that parsed. Once the fence closes, a diagram that
does not parse shows a note and its source.

## The chat's colours

The diagram takes its colours from the chat's theme (`--aparte-bg`, `--aparte-text`,
`--aparte-primary`…) and is drawn again when the theme changes. Its alt text is the diagram's own
`accTitle` or `accDescr`, else "Diagram"; set `diagramAlt` and `diagramError` with
`extendLocale()` to translate the fallback and the error note.

## Options

`setupMermaid(options?, config?)` takes `MermaidOptions`:

| option | default | |
| --- | --- | --- |
| `progressive` | `true` | `false` draws a diagram once its fence has closed |
| `mermaid` | `{}` | Mermaid's own configuration: a `flowchart` curve, `themeVariables`… |

## Two entry points

`@aparte/plugin-mermaid` imports Mermaid on the first diagram. To hand it over yourself, use the
entry that imports nothing from `mermaid`:

```ts
import mermaid from 'mermaid';
import { setupMermaidWith } from '@aparte/plugin-mermaid/core';

setupMermaidWith(mermaid);
```

`setupMermaidWith` takes the instance, or a function returning a promise of it, and any object
shaped like `MermaidLike` (`initialize`, `parse`, `render`). Both functions return a disposer.

Mermaid keeps one configuration for the whole page, and the plugin calls `initialize` with its
own before every diagram it draws. If your page also draws diagrams of its own with the same
Mermaid, call `mermaid.initialize(yourConfig)` again before your own `render()` or `run()`.

ESM only.
