---
"@aparte/core": patch
---

`<aparte-context>` now formats its numbers with `locale.tag` instead of the browser's.

Both `Intl.NumberFormat` calls in the gauge passed `undefined` — "follow the BROWSER" — which is exactly the bug `AparteLocale.tag` was added to close, and which `<aparte-conversation-list>` and the bubble's clock already read it for. So an app that called `setLocale(fr)` moved fifty strings and left the gauge counting in en-US: `14%` where French writes `14 %`, and `128K` where `ja-JP` writes `12.8万`.

Both the bar's reading and the ring's percentage follow the tag now, including the meter's `aria-label`. A locale with no tag still follows the browser, which is the documented English default.
