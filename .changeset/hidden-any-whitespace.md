---
'@aparte/core': patch
---

`hidden` now hides a kit element whatever whitespace separates its classes, and `hidden="until-found"` keeps its find-in-page reveal.

```html
<!-- The newline before the kit's class used to leave this footer painted. -->
<footer class="my-footer
  aparte-card__footer" hidden>…</footer>
```

Do you have to touch your code? No. An element that carries `hidden` and a kit class is now hidden in the cases below, where it used to stay visible. One that carries `hidden="until-found"` is no longer forced to `display: none`: see the second point.

- **Any whitespace.** HTML separates class names with any ASCII whitespace: space, tab, line feed, form feed, carriage return. The kit's rule knew only the space, so `hidden` did nothing on an element whose kit class came after a tab or a newline (a multi-line `className` template string in JSX writes one), or started a value that began with one: `class="my-footer\naparte-card__footer" hidden` kept the `display: flex` of `.aparte-card__footer`. Measured in Chromium on the published stylesheet: a tab and a line feed gave `flex` before; the tab, the line feed, the form feed and the carriage return, in either position, give `none` now.
- **`hidden="until-found"`.** The kit forced `display: none` on it, which defeats the browser's find-in-page: the browser hides that state with `content-visibility: hidden`, so that a match inside can reveal it. The kit now leaves it alone, and the element keeps its own box while its content is hidden, as any element with that state does: a `.aparte-card__footer` measured 17px (its padding and its border), where it was 0. An engine that does not know `until-found` reads it as plain `hidden`, whose `display: none` the recipe's `display` outranks, so there such an element is shown. Only an element you wrote `until-found` on is concerned.
- **Still the kit's classes only.** No bare `[hidden]`: a host element is untouched, and so is a class that merely contains the prefix (`my-aparte-card`).
- **Tests.** The stylesheet test reads what the selectors mean, decoding their CSS escapes: a tab needle written `\9aparte-` would be U+009A followed by `parte-`, because `a` is a hex digit, and fails there as it does in a browser. A Playwright spec builds the elements on the published stylesheet and reads what the engine paints.
