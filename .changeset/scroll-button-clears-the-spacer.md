---
"@aparte/core": patch
---

The scroll-to-bottom button floats 16px above the transcript's bottom edge in framework-managed mode (React, Vue, Svelte, Angular wrappers), at every scroll position. It used to sit the whole `padding + spacer` higher — up to a few hundred pixels into the messages.

Two causes, one per symptom. A `position: sticky` child is clamped to its parent's *content* box, and the bottom spacer was carried as `padding-bottom` on the scrolling host — territory the button could never enter — so it hung `padding + spacer` above the edge wherever the reader was. The clearance now lives in an `::after` flex item instead: still nothing in the DOM, so the framework's reconciliation sees exactly what it saw before. And a bottom-sticky element sits at its *flow* position whenever that is above the sticky line, so a button flowing before a 230px spacer drifted upward as the reader neared the bottom — `order: 1` puts its flow position after the spacer, and the sticky line always wins.

If you worked around this with your own `padding-bottom: 0` + `::after` override on the viewport, you can remove it — it is now a no-op with the same values.

Measured in the browser (spacer 0/60/130/230px): the button holds 16px at every distance from the bottom; before, it floated 48/108/178/278px. A new e2e spec (`scroll-button.spec.ts`) asserts the rendered geometry in both transcript modes on Chromium and WebKit — the first assertion in the repo that *locates* this button rather than driving it.
