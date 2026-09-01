---
"@aparte/core": patch
---

The segmented tab track is as wide as its chips (not its container), its selected chip is raised on both grounds, the tab panel shares the tab's inline inset; the elicitation's recommended option keeps its ground while focused, and the options sit far enough apart for the focus ring to show whole.

`.aparte-tabs--segmented` was a block-level flex row and painted 1207px of track for 160px of chips at 1280; it is `inline-flex`. Its selected chip was an absolute surface level — raised in light, sunken in dark — and now carries a 1px ring in the border colour. The panel had no inline padding, so its text hung 11px left of the tab above it. In the elicitation panel the recommended option, the one that takes focus on mount, was the only row with no ground: the rule that cleared its tinted border under focus cleared its background too. And the options sat 2px apart, narrower than the focus ring's outset, so the next row painted over the ring's bottom edge; the gap is 6px.
