---
'@aparte/plugin-streaming-markdown': minor
---

With a maths renderer registered (`@aparte/plugin-katex`), a streamed formula is now drawn while it arrives; with none registered, nothing changes.

The fork wrote `$…$` and `$$…$$` as `<equation-inline>` and `<equation-block>`, elements nothing on the page draws, so a formula stayed raw TeX until the reply settled. Each is now written as `<code class="language-math math-inline">` or `math-display` — the placeholder `@aparte/plugin-marked` writes and core's code-language engine draws — and carries `data-aparte-open` until its closer arrives.
