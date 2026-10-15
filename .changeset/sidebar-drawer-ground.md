---
'@aparte/core': patch
---

The open sidebar drawer shows its own background again instead of being greyed out by its scrim. Nothing to change in your code.

The open drawer is a stacking context, and its scrim is a child at `z-index: -1`, which paints above the drawer's own background. The panel came out dimmed: a white ground measured 166,166,166 under the default scrim. Only the children with a background of their own (the search field, the selected row) stayed bright. The drawer's ground is now painted again by an `::after` above the scrim. It inherits the element's background, so a ground set through `--aparte-sidebar-bg` or through a selector of your own is the one shown.
