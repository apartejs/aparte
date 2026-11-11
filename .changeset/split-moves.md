---
'@aparte/core': minor
---

`<aparte-split>` now moves between one pane and two when `single` changes, instead of jumping.

Nothing to change in your code. The pane that arrives is uncovered at the size it will have, the one that leaves is covered, in the theme's `--aparte-duration-slower`. There is no move under `prefers-reduced-motion`, nor when the split is stacked by its breakpoint. To keep the change immediate:

```css
aparte-split[data-moving] {
  transition: none;
}
```

While it moves, the element carries `data-moving` and lays both panes out. Before this, a pane beside the chat appeared at once while the sidebar animated its fold.
