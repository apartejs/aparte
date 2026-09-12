---
"@aparte/core": patch
---

A fenced code block rendered from markdown no longer paints an inline-code background on every line; nothing to change on your side.

The prose rule for inline `code` matched the `<code>` inside a `<pre>` too, and with `white-space: pre-wrap` its background and padding paint per line box: every line of a markdown block wore its own stripe, with a notch at its start. The rule is scoped to `:not(pre) > code` now, so inline code keeps its chip and a block keeps one surface.
