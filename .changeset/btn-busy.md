---
'@aparte/core': minor
---

A busy `.aparte-btn` (`aria-busy="true"`) now shows an `.aparte-spinner` child at its icon's size and in its ink colour.

```html
<button class="aparte-btn aparte-btn--primary aparte-btn--solid" type="button" aria-busy="true">
  <span class="aparte-spinner" aria-hidden="true"></span>
  Loading…
</button>
```

Do you have to touch your code? No. A spinner you already put in a busy button keeps working: it is now drawn at the button's icon size and in the button's colour, whatever `--sm` or `--lg` it carries. A spinner anywhere else, in a button that is not `aria-busy`, or not a direct child of the button, is unchanged.

- **Colour.** The ring was the spinner's own muted grey on every fill. Measured against the fill in the light theme: 1.55:1 on a solid primary button, 1:1 on a solid neutral one (the ring was the fill's own colour, so it was invisible), 1.49:1 on danger and 2.61:1 on warning. It is the button's ink now, so it reads like the label does: 5.27, 5.5, 5.05 and 8.84:1. In the dark theme a solid primary ring went from 1.15:1 to 8.3:1. A `disabled` busy button keeps the recipe's disabled look, and its ring is muted with it.
- **Size.** The spinner takes `--aparte-btn-icon-size`, the size an icon gets in a button: 19.4px on the default button, 13px on `--sm`, 21.6px on `--lg` and `--xl` at the default type scale, where it was 16px on all of them. Replacing an icon with it no longer moves the button, which was 3 to 5.6px wider or narrower. The rule declares `--aparte-spinner-size` on the spinner, so `.aparte-spinner--sm` and `--lg` lose to it by selector, not by which sheet loads last; to size one yourself, set `--aparte-spinner-size` in its `style`.
- **Pointer.** The spinner takes no pointer events, like an icon in a button, so a click on it is a click on the button.
- **As before.** The cursor is `progress`, also on a `disabled` button. Reduced motion stops the ring, as it does every `.aparte-spinner`. `aria-busy` does not dim or disable the button: add `disabled` when a second click must do nothing.
- **Not done.** The button keeps no width of its own: it follows its label, so a button that changes its label while busy ("Load model", then "Loading…") still resizes. Give it a minimum width. CSS cannot know the width of a label it has not been given.
- **Docs.** The button page gains a Busy section with this markup, and an accessibility note: a screen reader often ignores `aria-busy` alone, so the label should say what is happening.
