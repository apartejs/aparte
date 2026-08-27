---
'@aparte/plugin-ask-user': patch
'@aparte/plugin-model-selector': patch
---

`ask-user`'s question receipt is an `.aparte-tag`. It is a pill holding a truncating
label, which is what that recipe is, and it used to redeclare the whole thing. Its own
CSS drops from 33 declarations to 22; the card's rule goes from 11 to 6, four of them
now setting the tag's tokens rather than restating its properties. Nothing moves on
screen.

This is also the first place in the repo where a plugin reaches core's recipes, which
is the point: they are plain classes on a stylesheet core already ships, so a plugin
needs no import, no client and no build step to use them.

`model-selector` no longer puts `aparte-model-selector-select` on its `<aparte-select>`.
It carried no CSS and was queried by nothing. The element is addressable as
`aparte-model-selector aparte-select`, which is what a consumer restyling it writes.
