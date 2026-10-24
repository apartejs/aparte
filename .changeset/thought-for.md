---
"@aparte/core": minor
---

A settled reasoning block reads "Thought" (`thought`) instead of "Thinking"; turn on `showDuration` to read "Thought for 8s" (`thoughtFor`).

It read "Thinking" while the model reasoned and "Thinking" forever after, so a finished block looked like one still running. The duration stays the app's to show: core measures it in the browser, from the first reasoning delta to the last, which is the model's thinking time only when the provider streams its reasoning — one that sends it in one piece would read "1s", and a reload shows it only if the stored segment kept its `meta`. `setSegmentDefaults('thinking', { showDuration: true })` turns it on for every block; the duration is formatted by `Intl` in the locale's `tag` ("8s", "1m 12s"), with a one-second floor. An app's own `label` still wins, and wrapping the renderer is still how a product writes its own format.
