---
'@aparte/plugin-cards': minor
---

What `setupWeatherCard()` and every other card setup returns now also has `.refresh()`, which runs `actions(data, { origin })` again for the cards on screen.

Nothing to change in your code: the return is still the function that takes the card off. Use `refresh()` when what `actions` reads changes after the card is drawn (the person signs in, an item is saved); the buttons are redrawn in place, with the focus kept, and a card that already left the page is left alone. The return type is the new `CardSetupHandle`.
