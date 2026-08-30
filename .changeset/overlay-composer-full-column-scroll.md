---
"@aparte/core": patch
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

`overlay-composer` on `<aparte-chat>` (and `overlayComposer` on all four wrappers): the transcript's scroll surface spans the whole column and the composer floats over it, so the scrollbar runs edge to edge instead of stopping at the composer's top — the full-page anatomy the Layout guide sold without this half. Opt-in, never the default: a chat embedded in a small box should not have its composer eating the transcript.

The viewport leaves the flow (absolute over the shell); elicitation, an above-composer row and the composer keep flowing, bottom-anchored, painted over it. The viewport measures that stack and publishes `--aparte-bottom-inset`; content, the spacer and the scroll button clear it — and its readers are unconditional (0px unset), so a host that overlays a composer of its own can write the variable by hand without the attribute. When the composer grows under a reader pinned at the bottom, the inset is re-measured and the reader re-anchored in the same observer pass — the view-jump every hand-rolled overlay hits.

The attribute is read when the viewport wires its observers: set it in the initial markup. Angular binds it on its inner `.aparte-chat-container` (there the host is the `aparte-chat` element and the viewport is the inner div's child) — use the `overlayComposer` input.
