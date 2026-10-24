---
"@aparte/core": minor
---

`AparteClient` sends the new `aparte-message-resumed` when a paused turn goes on after the page answered its paused calls, and a turn that starts from a saved pause now sends `aparte-message-paused` right after `aparte-message-start`.

`aparte-message-paused` had no other half: a listener tracking a turn heard it stop to wait and never heard it run again until `aparte-message-done`, and a turn resumed after a reload said "start" while it was asking. New type: `AparteMessageResumedEventDetail`; `APARTE_DEFAULT_UI_EVENTS` lists the event.

`resumeDeferred` no longer starts a reply a turn is already running into: loading the open conversation again (a click on it) while its pause waited put the same question twice and started the same reply a second time.
