---
"@aparte/core": minor
---

`AparteChatHost.takeEcho(list)` tells a wrapper whether a list the parent hands back is the host's own report coming back, or the parent's word.

Call it before applying the list a two-way binding gives you. It answers true for a report the parent has not handed back yet — however late it lands — and takes it with every older one; for any other list it answers false and clears them, so a list the parent restores later is applied. The four first-party wrappers use it; a wrapper of your own over `AparteChatHost` gets the same rule.
