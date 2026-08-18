---
"@aparte/react": patch
---

Fix the `aparte-*` JSX types under **React 19**. The wrapper declared its custom
elements only in the legacy *global* `JSX` namespace, which React 19 no longer
consults (`React.JSX` replaced it) — so any React 19 consumer writing
`<aparte-composer-input />` (for instance to slot a custom composer) got
`TS2339: Property 'aparte-composer-input' does not exist on type
'JSX.IntrinsicElements'`, despite the peer range advertising `^18 || ^19`. The
element list is now declared once and merged into both namespaces, so React 18
and 19 consumers both see it.

The blind spot is closed too: the package is developed against `@types/react` 19
(its own JSX would fail to compile without the augmentation), and the React
playground's typecheck — now part of the gate — covers the consumer-side case.
