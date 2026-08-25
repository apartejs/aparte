---
'@aparte/core': patch
---

The composer's one panel slot now has an owner, which closes a defect that could permanently stop a chat from asking anything.

`showPanel` returns a token and accepts an `onEvict` callback; `hidePanel(token)` closes the panel only if that token still owns the slot. Both additions are additive — code that calls `showPanel()` and `hidePanel()` as before is unchanged.

The defect: the composer tears its panel down on **every** turn-ending event, and `<aparte-elicitation>` only listened for `aparte-message-error` and `aparte-message-aborted`. A question still open when a turn completed normally therefore lost its panel while the presenter kept its pending state — so `requestUserInput()` never settled, and because the presenter refuses a second request while one is pending, every later question was short-circuited for the life of the page. One finished turn and the chat could never ask again.

Three paths could close a panel whose owner was still awaiting an answer, and none of them told the owner: a second `showPanel`, the owner's own late `hidePanel`, and the turn-end teardown. All three now notify, and a presenter settling late can no longer tear down the panel that replaced its own.
