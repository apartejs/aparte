---
'@aparte/core': patch
---

Eight types a public type already named are now exported: six element attribute interfaces, `AparteRequestMeta` and `AparteConversationsListener`.

`AparteContextAttributes`, `AparteIconAttributes`, `AparteScrollRailAttributes`, `AparteSidebarAttributes`, `AparteSplitAttributes` and `AparteSuggestionsAttributes` were generated but missing from the package entry; `AparteRequestMeta` is the type of `AparteChatRequest._meta`; `AparteConversationsListener` is what `AparteConversationManager.subscribe` takes. A consumer can now name all of them. Types only: nothing changes at run time.
