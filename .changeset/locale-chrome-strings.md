---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

Two chrome strings now follow the locale: the scroll-to-bottom button's accessible name (`scrollToBottom`) and the title of the message `compact()` injects (`compactionSummaryTitle`, no emoji any more). `@aparte/locale-fr` ships both.

Both were hardcoded English in an otherwise localised transcript — a French chat compacted into a "📝 Conversation summary" header, and its one floating button was announced in English. The keys are optional on `AparteLocale`, so an existing locale package keeps compiling and falls back to English per key until it adds them. The engine compactor's own `summaryLabel` is unchanged: it is a per-call knob on the prompt side, this is the UI title.
