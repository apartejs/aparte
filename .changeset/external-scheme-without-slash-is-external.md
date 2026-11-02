---
"@aparte/core": patch
"@aparte/plugin-streaming-markdown": patch
---

A link a model writes with an explicit scheme and no slash, `[docs](http:evil.example/x)`, now opens in a new tab like any other external link, and a `target="_self"` on it is ignored.

On an `https` page that URL resolves to `http://evil.example/x`, but it was treated as same-site and navigated the frame the chat lives in (in Electron, the whole app). Any link starting with `http:` or `https:` is now external, in the built-in sanitizer and in the live streamed link of `@aparte/plugin-streaming-markdown`. A same-site link spelled `https:/path` goes to a new tab too, which is harmless.
