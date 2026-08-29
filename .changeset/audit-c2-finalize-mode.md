---
"@aparte/core": patch
---

Reusing an `AparteStreamParser` after a reply that ended mid-fence or mid-block no longer swallows the next reply.

`finalize()` flushed what was left but never spent the mode it was in. A reply cut off inside a ``` fence, a `<think>` block or a registered `<tag>` left the parser waiting for a closing delimiter that would never come, so the first characters of the NEXT reply were eaten by that wait — silently, with no segment to show for them. The built-in client builds a fresh parser for every turn, so this bites a consumer who drives `AparteStreamParser` themselves and keeps it across replies — the bring-your-own-loop path. `finalize()` now returns the parser to `text` with an empty buffer and no armed delimiter.
