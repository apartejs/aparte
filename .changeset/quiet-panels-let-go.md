---
"@aparte/core": patch
---

Closing or evicting a composer panel no longer steals the focus: the caret stays where the reader put it unless focus was inside the composer.

`_teardownPanel()` ended on an unconditional `this.focus()`, which forwards to the composer's editor. So every close moved the caret there — including the one nobody asks for: a turn ending evicts any open panel, and a turn ends because the model finished. A reader who had moved to another chat's field, a search box, or a link was pulled back mid-keystroke.

It now asks first, and asks BEFORE removing the panel: removing the focused element drops focus to `<body>`, after which the question has no answer. That is the reasoning `<aparte-elicitation>`'s own restoration already records — and its guard was being defeated by this one, since the teardown ran first and put the focus back inside the composer, which made "was the reader still in the panel?" answer yes.
