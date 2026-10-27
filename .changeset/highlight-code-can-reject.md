---
'@aparte/core': minor
---

`config.highlightCode(code, lang, { fallback: false })` now rejects when the highlight provider fails, instead of answering the plain block; without the option nothing changes.

Core's own highlight passes use it. A settled block is no longer highlighted again when a framework re-syncs it, which made a failure permanent: a highlighter that failed once (Shiki still loading its grammars) left the block plain, and marked as done, for good. A failed block now stays plain and unmarked, and the next pass tries it again. Two cases that also kept a block plain are fixed: a code segment re-synced under another config (a wrapper attaches the chat's config after the first draw) is highlighted again with that config's highlighter, and a reply whose bubble left the page while its highlight ran gets its colours when it comes back.
