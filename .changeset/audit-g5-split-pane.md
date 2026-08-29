---
"@aparte/core": patch
---

`<aparte-split pane="end">` keeps that pane when it loads stacked on a narrow screen, and every `showPane()` that changes the pane commits it and fires `aparte-split-resize`.

Entering the stacked state showed the start pane unconditionally, deleting the choice the markup had already made. And because that write happens during the mount, where the attribute callback is suppressed, the element never recorded it: a later `showPane('end')` looked like no change and committed nothing, so the host heard no `aparte-split-resize` and its two-button toggle went dead once.

The stacked check also read the `stacked` getter, which counts the CSS route (`.aparte-split--only-start` / `--only-end`) as well as the element's own `data-stacked`. A `breakpoint="none"` split wearing one of those classes therefore looked, at mount, like a split leaving a state it had never entered — and had its authored `pane` removed on the way in.
