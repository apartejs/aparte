---
"@aparte/plugin-streaming-markdown": patch
---

A link now opens in its own tab from the moment it streams in, instead of only after the message settles.

The streaming renderer writes DOM directly, so it bypasses the one-shot sanitizer — which is why it already applies core's URL-scheme policy live through `isSafeUrl`. It did not apply the other half: until the settle re-render, every model link was a bare anchor that navigated the frame the chat lives in, clickable for the whole length of the reply.

An external `href` (`https://`, `http://`, the scheme-relative `//host`, and the spellings that resolve off-site just the same — `/\host`, `http:/host`) now gets `target="_blank" rel="noopener noreferrer"` as it is written. Same-site and in-page links are left alone, exactly as the one-shot path leaves them. The rule is a deliberate, minimal copy of core's `config/sanitize.ts`, which owns it — core exports `isSafeUrl` but not this predicate, and the comment beside it says so.
