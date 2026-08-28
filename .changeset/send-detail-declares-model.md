---
"@aparte/core": minor
---

`AparteSendEventDetail` declares `modelId` and `providerId`: an `aparte-send` carrying them sends that one message to that model, overriding the config's default for the turn — a per-message model picker.

`AparteClient` has honoured both fields for as long as it has read `event.detail`, while nothing declared them and the composer never sent them, so the capability existed only for whoever read the client's source. Declaring it is what makes it real; the generated events reference picks it up.
