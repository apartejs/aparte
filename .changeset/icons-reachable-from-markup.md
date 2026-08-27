---
'@aparte/core': minor
---

`<aparte-icon>` — the icon set, reachable from markup.

Core ships 25 glyphs and sells `setIconProvider` as the lever that swaps them, and the only
door in was `getIcon(name)`: JavaScript. So a consumer writing plain HTML could not place
one, and the provider they registered could not reach a single icon in their own templates.
`<aparte-composer-action>`'s own documentation tells you to put an `<svg>` inside it, which
is that gap written down as an instruction.

It is why every example on the CSS-classes reference carried 265 characters of path data to
demonstrate a 60-character class — there was no shorter way to say "an icon goes here" that
actually drew one. Those examples now read `<aparte-icon name="copy">`, and SVG is **0%** of
the markup that page publishes, against 22% before.

```html
<button class="aparte-btn aparte-btn--icon" aria-label="Copy">
  <aparte-icon name="copy"></aparte-icon>
</button>
```

It routes through `getIcon`, so it is not a second icon mechanism — it is a markup entrance
to the one that exists. Register a provider and every `<aparte-icon>` follows, including
ones mounted before the provider was set.

**Why an element and not CSS classes.** A `mask-image` class would need no JavaScript, and
that is genuinely attractive — but it cannot consult the icon provider, so a consumer who
swapped the set would get theirs where core draws and ours where they wrote a class: the
exact inconsistency this closes, moved elsewhere. A masked icon is also painted by a
`background`, which forced-colors mode drops, while an inline SVG on `currentColor`
survives — the same argument `menu.css` already makes for its checkmark. Weight was not the
deciding factor: 25 encoded glyphs are ~7 kB against the stylesheet's 263 kB.

**The cost, stated:** the 25 glyph names become public API. `expand`, `copy`, `nextBranch`
were internal identifiers; renaming one now breaks a consumer's markup.

An unknown name draws nothing rather than printing `undefined`, and the glyph is
`aria-hidden` — when the icon is a button's only content, name the button.
