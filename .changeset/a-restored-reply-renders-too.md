---
"@aparte/core": patch
"@aparte/plugin-streaming-markdown": patch
---

With `@aparte/plugin-streaming-markdown` as your only Markdown renderer, a reply that arrives complete — a conversation restored after a reload, a non-streaming provider's answer — now renders as Markdown instead of its raw source. Nothing to change on your side; a one-shot provider registered as a workaround can go (#93).

The plugin rendered a reply while it streamed, and a reply that never streamed went through `renderMarkdown`, which knew only the one-shot provider and fell back to core's escape-and-`<br>` default. So the same text rendered two ways depending on how it arrived, and the plugin page's "that is all you need" held for half of them. `renderMarkdown` now runs a complete string through the incremental provider when no one-shot provider is registered — into a detached element, then through the sanitizer, the same two steps a streamed reply takes. A registered one-shot provider still takes precedence, a server render with no `document` still gets the escaping default, and a provider that throws on the whole string falls back to it too.
