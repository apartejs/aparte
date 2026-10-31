---
'@aparte/core': patch
'@aparte/plugin-cards': patch
---

A card of your own (`defineCard`) is drawn from its ```` ```card-<name> ```` block even when it is set up after `setupCardFences()`, and a block can pick the card's layout with `"variant"` in its JSON.

- plugin-cards: `setupCardFences()` hears of each card set up on its config from then on and draws its blocks too; before, only the cards known when it started were, and a card defined later showed its source.
- plugin-cards: `"variant": "<name>"` in a block's JSON picks that layout when it is one of the card's; any other value is the card's data as before.
- plugin-cards: a product alone in its answer is drawn with a landscape picture, and with a low band when it has none. The square frame, the width of a chat column, made the card taller than the chat's view, and empty when the product had no picture. In a row of products the tiles stay square.
- core, plugin-cards: a message with padding and a card with its border no longer run past their column. Both took `max-width: 100%` and counted padding or border outside it, so a bubble clipped their right edge.
