---
"@aparte/core": patch
---

A tool's Input and Output are coloured as JSON only when they are JSON, scroll past 300px, sit on the code surface, and each has a copy button; the row fits a phone.

Both parts went to the highlighter as `json` whatever they held, so a prose result came back tinted as an object; a part is JSON when it parses to an object or an array, and a JSON result is pretty-printed. A part's body is capped by `--aparte-tool-part-max-height` (300px, the reasoning block's cap), scrolls, and is a focusable, named region; its text is on the code surface at the small size whether or not a highlighter coloured it, and its label now sits in `.aparte-tool-part-head` beside the copy button — the code block's, now one shared helper. On a narrow screen the state word never yields: the note and the target give way first, then the name, cut with an ellipsis, and the note carries its full text as its title.
