---
"@aparte/core": patch
---

A tool's Input and Output are coloured as JSON only when they are JSON, scroll past 300px, and each has a copy button.

Both parts went to the highlighter as `json` whatever they held, so a prose result came back tinted as an object; a part is JSON when it parses to an object or an array, and a JSON result is pretty-printed. A part's body is capped by `--aparte-tool-part-max-height` (300px, the reasoning block's cap), scrolls, and is a focusable, named region. The copy button is the code block's, now one shared helper.
