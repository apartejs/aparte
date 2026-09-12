---
"@aparte/plugin-artifacts": patch
---

A CSS artifact can no longer close its own `<style>` and run a script, the binary preview is sanitised by the config of the chat it is mounted in, and a card's tab ids are unique per card. Nothing to change in your code.

**The `css` preview only styles.** `<style>` is raw text to the HTML parser exactly like `<script>` — it ends on `</style` followed by whitespace, `/`, `>` or end-of-input, whatever the CSS tokenizer thinks — and the `css` kind interpolated the model's body into it unescaped while the sibling `js` kind ran its body through `escapeClosingScriptTag`. So a stylesheet artifact could break out of its wrapper and open a `<script>`, on the one previewable kind whose whole promise is that it only styles. The containment always held (opaque origin, no `allow-same-origin`, and `PREVIEW_CSP` applied both as the `csp` attribute and as a `<meta http-equiv>`), so this was the gap between what "preview this stylesheet" promises and what it does. A closing-`</style>` escaper now mirrors the script one.

**The binary preview reads the element's config.** `previewMarkup` resolved the *ambient* config, which from the promise callback that swaps the preview in is the global one long after the render — so a chat with its own `AparteConfig` that registered DOMPurify through `setHtmlSanitizer` had that policy silently skipped at the one sink that puts app-supplied HTML on the page, and its locale skipped at the sentence beside it. Both callers already held the right config; it is passed in now. It failed safe before (the global default is core's own allowlist), which is why nothing showed it.

**A card's tab ids come from a counter, not from the model.** They were built from `segment.id`, and for a tool-call segment that is `tool-${toolCallId}` — the id the model chose. Two calls answering to the same id put two cards on the page wearing the same `id` and the same `aria-controls`, so `getElementById` returned whichever parsed first: exactly the collision the scoping was introduced to prevent, and the DOM-clobbering shape core's sanitizer already refuses on model markup.
