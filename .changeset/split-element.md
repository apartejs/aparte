---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

Add `<aparte-split>`: two panes and a seam you can drag, arrow or collapse — the builder split, as an element.

`position` in and one `aparte-split-resize` out on release; the library stores nothing, so persistence is one `localStorage.setItem` in your listener. The attribute is written on COMMIT only — a release, a key up, a double-click, a property set — and the live value during a drag travels on `--aparte-split-position`, so a framework's reconciler is never in the drag loop. The number you get back is the ACHIEVED size after the clamp, so the attribute, `aria-valuenow` and the event's detail are one number.

The bounds are CSS: `--aparte-split-min` (20rem) and `--aparte-split-max` (60%) are clamp arguments in the grid template, so px, %, rem and ch all work and nothing in JS parses a unit. `--aparte-split-handle-size` (4px) is the seam and `--aparte-split-hit-area` (12px, the touch target on a coarse pointer) is the invisible zone you can grab it by.

Keys, on the seam: the arrows step 1%, Shift 10% (an ecosystem convention, not the APG), Home and End go to the bounds, Enter collapses and a second Enter restores the size it had, Escape cancels a drag in flight. `aria-orientation` on the seam is the inverse of the element's `orientation` — the attribute names the SEPARATOR's axis, which is what ARIA 1.2 and the APG's window splitter mean by it.

Under `breakpoint` (48rem by default, `none` to never stack) it shows one pane and writes `data-stacked`; any `[data-aparte-split-pane="start|end"]` on the page switches it with no script, the way `[data-aparte-sidebar-toggle]` drives the sidebar. `orientation="vertical"` stacks the panes and moves the seam to the block axis; `primary="end"` sizes the last pane instead of the first.

The recipe works without the element: `.aparte-split` is a grid you can set a position on from your own media query, `.aparte-split--vertical` / `--primary-end` / `--only-start` / `--only-end` are the class form of the four states, and `.aparte-split__pane` is the scrolling wrapper for the pane that is not a chat. A pane CONTAINS a chat; a chat never contains a split.

New locale key `splitHandleLabel` ("Resize the panes", "Redimensionner les panneaux") names the seam.
