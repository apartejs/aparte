---
'@aparte/core': minor
---

An error renderer can return `null` for an error it does not change: that error keeps aparté's card, translated on a language switch as before.

Nothing to change in your code. `setErrorRenderer` replaced the card for every error, so an app that wanted its own words for one code (`appCode === 'engine-died'`) rebuilt aparté's card by hand for all the others: a copy of its markup that drifts, and that a language switch no longer rewrote. Returning `null` made the card vanish. `null` or nothing now draws aparté's card for that error, exactly as without a renderer; a card you return is still never rewritten, even one that copies aparté's classes. `AparteErrorRenderer` returns `string | HTMLElement | null | undefined`.
