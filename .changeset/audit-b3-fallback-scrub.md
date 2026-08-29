---
"@aparte/core": patch
---

The DOM-free sanitizer (the `node` entry) now strips handlers written as `<img src=x/onerror=…>` and removes an unclosed `<svg>`/`<math>`/`<form>`.

When there is no `DOMParser` — SSR, Node, a test runner — the built-in degrades to a regex net, and that whole branch was untested. It had two hand-written tag lists that disagreed: `svg`, `math` and `form` were only in the paired pass, so an unclosed one walked straight through, and `button`/`select`/`title` and the rest were in neither. Its handler stripper demanded whitespace before `on…`, while HTML also ends an attribute at `/` and at the closing quote of the previous value, so `<img src=x/onerror=…>` and `<img src="x"onerror="…">` kept their handlers.

The handler pass also ran once, and it consumes the separator in front of the handler it removes — so two written back to back (`<img src=x onload="0"onerror="alert(1)">`) lost the quote that separated the second one and it survived. It now runs to a fixed point; the replacement is a space, which restores the separator for the next round.

Both tag passes now read `DANGEROUS_TAGS`, the same list the DOM path uses — the three document-structure tags (`html`, `head`, `body`) lose their tags but keep what they wrapped, matching what a real parser does with them. The net remains a safety net and not a security boundary: for untrusted HTML off the browser, register a real sanitizer (DOMPurify + jsdom) via `setHtmlSanitizer`.
