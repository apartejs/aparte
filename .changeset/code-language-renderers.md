---
'@aparte/core': minor
---

Register a renderer for a code language with `config.registerCodeLanguageRenderer({ languages, render })`, and that language is drawn wherever it appears in a reply, under any Markdown provider: this is the seam `@aparte/plugin-katex` and `@aparte/plugin-mermaid` use.

A Markdown provider marks a source with `<code class="language-X">` (inside a `<pre>` for a block; `math-display` / `math-inline` for maths) and core matches it to the renderer registered for X. Every fence in a streamed reply is already a code segment, so a ```` ```mermaid ```` block is drawn with no Markdown provider at all; maths needs a provider that recognises it. `renderCodeLanguages(root)` runs the same engine over an element of your own.

The drawing goes beside the source and never inside it, so copying, the history the model reads and an incremental provider still writing tokens all keep the source. While a reply streams, a source is drawn as it arrives and the last drawing stays while the next one cannot be made yet; once settled, everything is drawn in full, and drawings are cached, so a framework re-render or a rebuilt block costs nothing. What a renderer returns is inserted as it is, not through the HTML sanitizer, which would strip what a drawing is made of: it has the standing of a segment renderer's output. A renderer marked `lazy` draws only once its source comes near the screen, so reopening a long conversation does not draw every diagram in it at once.
