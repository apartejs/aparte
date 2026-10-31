---
'@aparte/core': patch
'@aparte/plugin-cards': patch
---

A card written as a ```` ```card-<name> ```` block is drawn on its own, without the code card's header, language label and copy button around it.

Core: a code-language renderer can say `bare: true` — its drawing then stands for the whole fenced block, and the code card around it goes. Diagrams, charts and maths keep their card and the copy of their source. `setupCardFences()` sets it.

A link in the person's own bubble (an email or a URL they typed) now takes the bubble's text colour, underlined: it was drawn in the link colour, which on a bubble filled with the primary was the bubble's own colour.
