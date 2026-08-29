---
"@aparte/core": minor
---

The composer's send button always means *submit*: `AparteComposerPanelMode` is `'submit' | 'none'`, the `'advance'` member is gone, and so is the locale key `elicitationNext`.

Breaking on two lines only. A `switch` or a comparison against `'advance'` no longer compiles. And a locale annotated `: AparteLocale` — the shape `@aparte/locale-fr` uses — fails to compile on `elicitationNext`; a bare object literal handed to `setLocale` still passes, and the key is simply read by nothing. Delete the line.

The button no longer "advances" through a form of several questions: it means submit throughout, enabled once every question has an answer, and the chips are the navigation — which was already true, since the chevron was a second way to do what a chip does. An answered chip now carries a check mark, and a `recommended` option a "Recommended" tag (new locale key `elicitationRecommended`).

Measured against the reference product: Claude Code's question panel switches questions by tab and submits everything with one button; a click selects and never submits. Ours did the same in a form, except for the button that pretended to be a "Next".
