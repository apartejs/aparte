---
"@aparte/core": patch
---

The scroll to a new message is no longer cut short when it starts while an earlier scroll is still running.

A send that lands during a glide re-targets it — a second smooth `scrollTo`, continuous where an instant write is a cut — and the engine runs that new smooth scroll from where the view is, for as long as a first one takes. The window in which the viewport holds back instant writes still ended where the earlier glide's did, so it closed in the middle of the re-targeted run and the next pin jumped the last few pixels (measured in CI on React and WebKit: a write 4 px short of the bottom, ~330 ms into the send). A re-target now opens a window of its own, and re-arms the pin that catches a glide that missed.
