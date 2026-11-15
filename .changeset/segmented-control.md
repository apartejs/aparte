---
'@aparte/core': minor
'@aparte/plugin-cards': minor
---

Add `.aparte-segmented`: a pill-shaped row of choices over native radio buttons, with `--sm` and `--block`, and keyboard focus drawn on the chosen segment.

Wrap each `<input type="radio">` and its text in a `<label class="aparte-segmented__item">` inside a `<div class="aparte-segmented" role="radiogroup">`. A row of buttons that each do something wears the same look, with `aria-pressed` on a `.aparte-segmented__item` button. The cards' range buttons now use this recipe: their markup keeps `aria-pressed` and `data-card-key`, and only the class names `aparte-rich-card__segmented` and `aparte-rich-card__segment` are gone (use `.aparte-segmented` and `.aparte-segmented__item` in any CSS of yours that reached them).
