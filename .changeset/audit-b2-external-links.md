---
"@aparte/core": patch
---

Links written as `//host`, `/\host`, `http:/host` or with leading whitespace now open in a new tab like every other external link.

The hardening tested the RAW attribute against `^https?://`, while the check that ACCEPTED the URL normalised it first (`isSafeUrl` strips control and space characters, so `" https://evil.example"` is accepted and `//attacker.example` passes as a relative URL). Both are external once a browser resolves them, and both kept the default target — they navigated the frame the chat lives in, which is the one thing this rule exists to prevent, and the docs promised the opposite. The external test now reads the same normalised value the accept path did.

Two more spellings resolve off-site and the allowlist accepts both: a backslash is a slash to a URL parser on a special scheme (`/\evil.example` is a relative URL), and a single slash after an explicit scheme enters authority state when that scheme differs from the page's (`http:/evil.example`). Measured with Node's WHATWG URL against base `https://site.example/chat/`, both land on `evil.example`. They are hardened too.

It stays a string test rather than `new URL(value, document.baseURI)`: this module has a documented DOM-free path, and resolving would quietly turn the rule into "cross-origin" instead of "external".
