---
"@aparte/core": patch
---

With `@aparte/plugin-streaming-markdown` installed as your only Markdown renderer, a reply now stays rendered when the turn ends instead of collapsing to raw Markdown source. Nothing to change on your side; a one-shot provider is now genuinely optional.

The settling update flushes the incremental parser and then re-renders the message once through the one-shot provider, for full fidelity. That trade only pays when a one-shot provider exists: with the streaming plugin alone, the one-shot side is core's zero-dependency default — escape plus `<br>` — so the re-render replaced `<strong>`, `<pre>` and `<ul>` with the Markdown that produced them, at the exact moment the reader stopped waiting. The message read richly for the whole stream and turned back into source on the last token.

`writeStreamedMarkdown` now asks the seam which renderer it is about to use. When `renderMarkdown` is core's built-in default, the flushed DOM is kept and passed through `sanitizeHtml` in place; when a provider is registered — including one that hands prose back untouched, since that is still the caller's renderer and not ours — the settle re-renders through it exactly as before. Either way a settled message is what the sanitizer produced, which is what allows an incremental provider to write DOM directly in the first place. The flush also feeds the parser any content the last streaming update did not carry, so what is kept is the whole message.
