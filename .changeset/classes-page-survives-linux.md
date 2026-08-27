---
'@aparte-workspace/docs': patch
---

Fixed: the CSS-classes reference lost all three of its groups on every Linux build.

`gen-css-classes.mjs` computed each sheet's `rel` by splitting its absolute path on a
hardcoded backslash. On POSIX nothing split, so every `match(rel)` returned false and all
37 sheets fell into the ungrouped tail — the Controls, Display and Surfaces sections and
their intros simply absent. CI is `ubuntu-latest` and the docs `build` runs `gen` first,
so every build there published the page that way while the copy committed from Windows
looked correct. It now splits on `path.sep`; simulated on both separators, the grouping is
identical (2 / 12 / 5).

The class floor could not see it: it counts CLASSES, all 323 were still present, and it
stayed green throughout. A second floor now asserts that every group matched a sheet —
count what a matcher matched, not only what it found.
