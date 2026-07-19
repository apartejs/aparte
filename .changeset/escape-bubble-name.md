---
"@aparte/core": patch
---

Fix an XSS sink: the chat bubble's public `name` attribute was interpolated raw into
`innerHTML` on initial render, while every sibling field (attachment names, etc.) was
escaped. An app that binds an untrusted author/persona name into `name` would ship a
script injection. Escaped it, consistent with the other fields, + a regression test.
